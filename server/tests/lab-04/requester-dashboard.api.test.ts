import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { insertTicket, referenceIds } from '../helpers/tickets'
import type { TicketStatus } from '../../src/generated/prisma/client'

// Requester Dashboard (BR-25 … BR-30) and the My Tickets filters its cards link
// to (D-12). The oracle for every number is a raw SQL query written
// independently of the route's Prisma calls.

let requester: { user: TestUser; agent: TestAgent }
let other: { user: TestUser; agent: TestAgent }
let empty: { user: TestUser; agent: TestAgent }

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN
const ago = (ms: number) => new Date(Date.now() - ms)

/** Inserts a Ticket and then fixes its Last Updated (Prisma sets it on insert). */
async function ticket(owner: TestUser, summary: string, status: TicketStatus, updatedAt: Date) {
  const t = await insertTicket({ requesterId: owner.id, summary, status })
  await prisma.ticket.update({ where: { id: t.id }, data: { updatedAt } })
  return t
}

const count = async (rows: Promise<{ n: bigint }[]>) => Number((await rows)[0].n)
const ids = async (rows: Promise<{ id: number }[]>) => (await rows).map((r) => r.id)

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  other = await createLoggedInUser({ role: 'REQUESTER' })
  empty = await createLoggedInUser({ role: 'REQUESTER' })

  // 8 for the requester: open ones, two waiting, and resolved / closed on both sides of the 30-day window.
  await ticket(requester.user, 'Dash open NEW', 'NEW', ago(10 * MIN))
  await ticket(requester.user, 'Dash open IN_PROGRESS', 'IN_PROGRESS', ago(20 * MIN))
  await ticket(requester.user, 'Dash waiting one', 'WAITING_FOR_REQUESTER', ago(30 * MIN))
  await ticket(requester.user, 'Dash waiting two', 'WAITING_FOR_REQUESTER', ago(40 * MIN))
  await ticket(requester.user, 'Dash resolved inside', 'RESOLVED', ago(30 * DAY - 5 * MIN))
  await ticket(requester.user, 'Dash closed inside', 'CLOSED', ago(2 * DAY))
  await ticket(requester.user, 'Dash resolved outside', 'RESOLVED', ago(30 * DAY + 5 * MIN))
  await ticket(requester.user, 'Dash cancelled', 'CANCELLED', ago(1 * DAY))
  // And some for the other requester, which must never leak in.
  await ticket(other.user, 'Other waiting', 'WAITING_FOR_REQUESTER', ago(1 * MIN))
  await ticket(other.user, 'Other open', 'OPEN', ago(2 * MIN))
  await ticket(other.user, 'Other resolved', 'RESOLVED', ago(3 * MIN))
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

const dash = (agent: TestAgent) => agent.get('/api/dashboard/requester')

// API-29 (BR-28, AC-25)
describe('API-29 the Requester dashboard is scoped to the signed-in Requester', () => {
  it('counts and lists contain only own Tickets, and no IT Priority appears anywhere', async () => {
    const res = await dash(requester.agent)
    expect(res.status).toBe(200)
    expect(res.body.metrics).toEqual({ open: 4, waitingForYou: 2, resolvedLast30Days: 2 })
    const summaries = [...res.body.needsAttention, ...res.body.recentlyUpdated].map((t: { summary: string }) => t.summary)
    expect(summaries.length).toBeGreaterThan(0)
    for (const s of summaries) expect(s.startsWith('Other')).toBe(false)
    expect(JSON.stringify(res.body)).not.toMatch(/itPriority/i)
    expect(Object.keys(res.body).sort()).toEqual(['generatedAt', 'metrics', 'needsAttention', 'recentlyUpdated'])
  })

  it('the other Requester gets their own numbers from the same endpoint', async () => {
    const res = await dash(other.agent)
    // Waiting for Requester counts as open (BR-26), so the waiting and the open Ticket make 2.
    expect(res.body.metrics).toEqual({ open: 2, waitingForYou: 1, resolvedLast30Days: 1 })
    expect(res.body.needsAttention.map((t: { summary: string }) => t.summary)).toEqual(['Other waiting'])
  })

  it('each list row has exactly id, ticketNumber, summary, status and updatedAt', async () => {
    const res = await dash(requester.agent)
    for (const row of [...res.body.needsAttention, ...res.body.recentlyUpdated]) {
      expect(Object.keys(row).sort()).toEqual(['id', 'status', 'summary', 'ticketNumber', 'updatedAt'])
    }
  })
})

// API-30 (BR-26, BR-27, AC-26)
describe('API-30 every Requester number equals a direct query', () => {
  it('open, waitingForYou and resolvedLast30Days, including a ticket just inside and just outside the window', async () => {
    const id = requester.user.id
    const open = await count(prisma.$queryRaw`SELECT count(*) AS n FROM "Ticket" WHERE "requesterId" = ${id} AND "currentStatus"::text NOT IN ('RESOLVED','CLOSED','CANCELLED')`)
    const waiting = await count(prisma.$queryRaw`SELECT count(*) AS n FROM "Ticket" WHERE "requesterId" = ${id} AND "currentStatus"::text = 'WAITING_FOR_REQUESTER'`)
    // "updatedAt" is stored as UTC without a zone, so compare it with UTC now.
    const resolved = await count(
      prisma.$queryRaw`SELECT count(*) AS n FROM "Ticket" WHERE "requesterId" = ${id} AND "currentStatus"::text IN ('RESOLVED','CLOSED') AND "updatedAt" >= (now() AT TIME ZONE 'UTC') - interval '30 days'`,
    )
    const res = await dash(requester.agent)
    expect(res.body.metrics).toEqual({ open, waitingForYou: waiting, resolvedLast30Days: resolved })
    expect(resolved).toBe(2) // inside (RESOLVED, CLOSED) counted; the one 5 minutes outside is not
  })

  it('needsAttention is the waiting Tickets, newest first; recentlyUpdated is everything, newest first, at most 5', async () => {
    const id = requester.user.id
    const waiting = await ids(prisma.$queryRaw`SELECT id FROM "Ticket" WHERE "requesterId" = ${id} AND "currentStatus"::text = 'WAITING_FOR_REQUESTER' ORDER BY "updatedAt" DESC, id DESC LIMIT 5`)
    const recent = await ids(prisma.$queryRaw`SELECT id FROM "Ticket" WHERE "requesterId" = ${id} ORDER BY "updatedAt" DESC, id DESC LIMIT 5`)
    const res = await dash(requester.agent)
    expect(res.body.needsAttention.map((t: { id: number }) => t.id)).toEqual(waiting)
    expect(res.body.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual(recent)
    expect(res.body.recentlyUpdated).toHaveLength(5)
    expect(res.body.needsAttention.every((t: { status: string }) => t.status === 'WAITING_FOR_REQUESTER')).toBe(true)
  })

  it('shows changes made after the previous call (computed live, no cache)', async () => {
    const before = (await dash(requester.agent)).body.metrics
    const t = await ticket(requester.user, 'Dash fresh waiting', 'WAITING_FOR_REQUESTER', new Date())
    const after = await dash(requester.agent)
    expect(after.body.metrics.waitingForYou).toBe(before.waitingForYou + 1)
    expect(after.body.metrics.open).toBe(before.open + 1)
    expect(after.body.needsAttention[0].id).toBe(t.id)
    await prisma.ticket.delete({ where: { id: t.id } })
  })
})

// API-31 (BR-29, AC-28)
describe('API-31 a Requester with no Tickets', () => {
  it('has zero counts and empty lists', async () => {
    const res = await dash(empty.agent)
    expect(res.status).toBe(200)
    expect(res.body.metrics).toEqual({ open: 0, waitingForYou: 0, resolvedLast30Days: 0 })
    expect(res.body.needsAttention).toEqual([])
    expect(res.body.recentlyUpdated).toEqual([])
  })
})

// API-36 (D-12, AC-32)
describe('API-36 My Tickets status and updatedWithinDays', () => {
  const list = async (query: string) => requester.agent.get(`/api/tickets?pageSize=50&${query}`)
  const summaries = (res: { body: { items: { summary: string }[] } }) => res.body.items.map((t) => t.summary).sort()

  it('status=open and status=resolved are groups', async () => {
    expect(summaries(await list('status=open'))).toEqual(['Dash open IN_PROGRESS', 'Dash open NEW', 'Dash waiting one', 'Dash waiting two'])
    expect(summaries(await list('status=resolved'))).toEqual(['Dash closed inside', 'Dash resolved inside', 'Dash resolved outside'])
  })

  it.each(['NEW', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const)('status=%s returns exactly that status', async (status) => {
    const res = await list(`status=${status}`)
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThan(0)
    expect(res.body.items.every((t: { currentStatus: string }) => t.currentStatus === status)).toBe(true)
    const direct = await count(prisma.$queryRaw`SELECT count(*) AS n FROM "Ticket" WHERE "requesterId" = ${requester.user.id} AND "currentStatus"::text = ${status}`)
    expect(res.body.total).toBe(direct)
  })

  it('updatedWithinDays keeps only Tickets updated inside the window', async () => {
    expect(summaries(await list('updatedWithinDays=1'))).toEqual(['Dash open IN_PROGRESS', 'Dash open NEW', 'Dash waiting one', 'Dash waiting two'])
    expect(summaries(await list('status=resolved&updatedWithinDays=30'))).toEqual(['Dash closed inside', 'Dash resolved inside'])
  })

  it('combines with search and category, and the other Requester’s Tickets never appear', async () => {
    expect(summaries(await list('status=open&search=waiting'))).toEqual(['Dash waiting one', 'Dash waiting two'])
    expect(summaries(await list('status=open&search=Other'))).toEqual([])
    const { categoryId } = await referenceIds()
    expect((await list(`status=open&categoryId=${categoryId}`)).body.total).toBe(4)
    expect((await list(`status=open&categoryId=${categoryId + 9999}`)).body.total).toBe(0)
  })

  it.each([
    ['status=bogus', 'status'],
    ['status=Open', 'status'],
    ['status=OPEN,NEW', 'status'],
    ['updatedWithinDays=0', 'updatedWithinDays'],
    ['updatedWithinDays=-3', 'updatedWithinDays'],
    ['updatedWithinDays=366', 'updatedWithinDays'],
    ['updatedWithinDays=1.5', 'updatedWithinDays'],
    ['updatedWithinDays=abc', 'updatedWithinDays'],
    ['updatedWithinDays=007', 'updatedWithinDays'],
    ['status=', 'status'],
    ['updatedWithinDays=', 'updatedWithinDays'],
  ])('%s is a 400 on that field', async (query, field) => {
    const res = await list(query)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field })
  })

  it('accepts the limits (1 and 365) and still answers with no filters at all', async () => {
    expect((await list('updatedWithinDays=1')).status).toBe(200)
    expect((await list('updatedWithinDays=365')).status).toBe(200)
    expect((await list('')).body.total).toBe(8)
  })
})

// API-38, Requester half (BR-30, AC-31)
describe('API-38 each Requester card equals its drill-down list', () => {
  it.each([
    ['open', 'status=open'],
    ['waitingForYou', 'status=WAITING_FOR_REQUESTER'],
    ['resolvedLast30Days', 'status=resolved&updatedWithinDays=30'],
  ] as const)('%s equals the total of its drill-down (%s)', async (metric, query) => {
    const card = (await dash(requester.agent)).body.metrics[metric]
    const list = await requester.agent.get(`/api/tickets?pageSize=1&${query}`)
    expect(list.body.total).toBe(card)
  })

  it('also holds for a Requester with no matching Tickets', async () => {
    const card = (await dash(empty.agent)).body.metrics
    expect((await empty.agent.get('/api/tickets?status=open')).body.total).toBe(card.open)
    expect((await empty.agent.get('/api/tickets?status=resolved&updatedWithinDays=30')).body.total).toBe(card.resolvedLast30Days)
  })
})

// Review of #75: a failing dashboard query is a safe 500, never the error text.
describe('a dashboard whose query fails answers a safe 500', () => {
  it.each([
    ['/api/dashboard/requester', () => requester.agent],
    ['/api/dashboard/staff', () => staffAgentForErrorTest()],
  ] as const)('%s', async (url, agent) => {
    const secret = `SELECT secret FROM hidden_${Date.now()}`
    const spy = vi.spyOn(prisma.ticket, 'count').mockRejectedValueOnce(new Error(secret))
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await agent().get(url)
    spy.mockRestore()
    quiet.mockRestore()
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('SERVER_ERROR')
    expect(JSON.stringify(res.body)).not.toContain(secret)
    expect(JSON.stringify(res.body)).not.toMatch(/select|prisma|stack/i)
  })
})

let staffForErrors: { user: TestUser; agent: TestAgent } | null = null
function staffAgentForErrorTest() {
  return staffForErrors!.agent
}
beforeAll(async () => {
  staffForErrors = await createLoggedInUser({ role: 'IT_STAFF' })
})
