import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { insertTicket } from '../helpers/tickets'
import { ALL_STATUSES } from '../../src/tickets/workflow'
import type { Priority, TicketStatus } from '../../src/generated/prisma/client'

// IT Staff / Administrator Dashboard (BR-25 … BR-31) and the queue filter its
// "Requester reports resolved" card links to (D-12). The staff numbers are
// global, so the oracle is raw SQL over the whole table; the fixtures make
// sure every list has more than 5 candidates and every filter has a match
// and a non-match.

let requester: { user: TestUser; agent: TestAgent }
let staff: { user: TestUser; agent: TestAgent }
let otherStaff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }
let fresh: { user: TestUser; agent: TestAgent }

const MIN = 60 * 1000
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

async function ticket(summary: string, status: TicketStatus, o: { priority?: Priority; ownerId?: number | null; reported?: boolean } = {}) {
  const t = await insertTicket({ requesterId: requester.user.id, summary, status, itPriority: o.priority, ownerId: o.ownerId ?? null })
  if (o.reported) await prisma.ticket.update({ where: { id: t.id }, data: { requesterResolvedAt: new Date() } })
  return t
}

const count = async (rows: Promise<{ n: bigint }[]>) => Number((await rows)[0].n)
const ids = async (rows: Promise<{ id: number }[]>) => (await rows).map((r) => r.id)
const idsOf = (rows: { id: number }[]) => rows.map((r) => r.id)

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  otherStaff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
  fresh = await createLoggedInUser({ role: 'IT_STAFF' })

  const mine = staff.user.id
  // Seven active critical Tickets (so "urgent" has to cut at 5), a mix of owners.
  for (let i = 1; i <= 7; i++) {
    await ticket(`Dash critical ${i}`, 'IN_PROGRESS', { priority: 'CRITICAL', ownerId: i % 2 ? mine : otherStaff.user.id })
  }
  await ticket('Dash critical closed', 'CLOSED', { priority: 'CRITICAL', ownerId: mine }) // not active, so not urgent
  await ticket('Dash unassigned new', 'NEW', { priority: 'HIGH' })
  await ticket('Dash unassigned open', 'OPEN', { priority: 'LOW' })
  await ticket('Dash reported active', 'IN_PROGRESS', { priority: 'MEDIUM', ownerId: mine, reported: true })
  await ticket('Dash reported closed', 'CLOSED', { priority: 'MEDIUM', ownerId: mine, reported: true })
  await ticket('Dash waiting', 'WAITING_FOR_REQUESTER', { priority: 'MEDIUM', ownerId: otherStaff.user.id })
  await ticket('Dash resolved', 'RESOLVED', { priority: 'LOW', ownerId: mine })
  await ticket('Dash reopened', 'REOPENED', { priority: 'HIGH', ownerId: mine })
  await ticket('Dash cancelled', 'CANCELLED', { priority: 'LOW', ownerId: mine })
  await ticket('Dash unassigned latest', 'NEW', { priority: 'MEDIUM' }) // the newest Ticket, with no owner
  // Seven Actions by the signed-in staff member at different times, one by someone else.
  const any = await prisma.ticket.findFirstOrThrow({ where: { requesterId: requester.user.id }, orderBy: { id: 'asc' } })
  for (let i = 1; i <= 7; i++) {
    await prisma.actionTaken.create({
      data: {
        ticketId: any.id, actionAt: new Date(Date.now() - i * 60 * MIN), status: i % 2 ? 'OPEN' : 'COMPLETED',
        description: `Dash action ${i} ${'x'.repeat(i === 1 ? 300 : 0)}`, result: i % 2 ? null : 'Done',
        performedById: mine, createdById: mine,
      },
    })
  }
  await prisma.actionTaken.create({
    data: { ticketId: any.id, actionAt: new Date(), status: 'OPEN', description: 'Dash action by someone else', performedById: otherStaff.user.id, createdById: otherStaff.user.id },
  })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

const dash = (agent: TestAgent) => agent.get('/api/dashboard/staff')

const ACTIVE_SQL = `"currentStatus"::text NOT IN ('CLOSED','CANCELLED')`
async function directCount(where: string, ...params: unknown[]) {
  return count(prisma.$queryRawUnsafe(`SELECT count(*) AS n FROM "Ticket" WHERE ${where}`, ...params))
}

// API-33 (BR-26, AC-27)
describe('API-33 every staff metric and list equals a direct query', () => {
  it('unassigned, myActive and requesterReportsResolved', async () => {
    const res = await dash(staff.agent)
    expect(res.status).toBe(200)
    expect(res.body.metrics).toEqual({
      unassigned: await directCount(`${ACTIVE_SQL} AND "ownerId" IS NULL`),
      myActive: await directCount(`${ACTIVE_SQL} AND "ownerId" = $1`, staff.user.id),
      requesterReportsResolved: await directCount(`${ACTIVE_SQL} AND "requesterResolvedAt" IS NOT NULL`),
    })
    expect(res.body.metrics.myActive).toBeGreaterThanOrEqual(6) // the fixtures: 4 critical + reported + reopened + ... (resolved counts, closed does not)
  })

  it('byStatus counts every Ticket and byItPriority counts only Active ones, each with all keys', async () => {
    const res = await dash(staff.agent)
    const statuses = await prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT "currentStatus"::text AS k, count(*) AS n FROM "Ticket" GROUP BY 1`
    const priorities = await prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT "itPriority"::text AS k, count(*) AS n FROM "Ticket" WHERE "currentStatus"::text NOT IN ('CLOSED','CANCELLED') GROUP BY 1`
    expect(Object.keys(res.body.byStatus)).toEqual(ALL_STATUSES)
    expect(Object.keys(res.body.byItPriority)).toEqual(PRIORITIES)
    for (const s of ALL_STATUSES) expect(res.body.byStatus[s]).toBe(Number(statuses.find((r) => r.k === s)?.n ?? 0))
    for (const p of PRIORITIES) expect(res.body.byItPriority[p]).toBe(Number(priorities.find((r) => r.k === p)?.n ?? 0))
  })

  it('urgent is the Active CRITICAL Tickets, newest first, cut at 5; recentlyUpdated is every Ticket, newest first, 5', async () => {
    const res = await dash(staff.agent)
    const urgent = await ids(prisma.$queryRawUnsafe(`SELECT id FROM "Ticket" WHERE ${ACTIVE_SQL} AND "itPriority"::text = 'CRITICAL' ORDER BY "updatedAt" DESC, id DESC LIMIT 5`))
    const recent = await ids(prisma.$queryRawUnsafe(`SELECT id FROM "Ticket" ORDER BY "updatedAt" DESC, id DESC LIMIT 5`))
    expect(idsOf(res.body.urgent)).toEqual(urgent)
    expect(idsOf(res.body.recentlyUpdated)).toEqual(recent)
    expect(res.body.urgent).toHaveLength(5)
    expect(res.body.urgent.every((t: { itPriority: string }) => t.itPriority === 'CRITICAL')).toBe(true)
    expect(res.body.urgent.map((t: { summary: string }) => t.summary)).not.toContain('Dash critical closed')
  })

  it('a list row carries the owner (or null) and no more than the documented fields', async () => {
    const res = await dash(staff.agent)
    for (const row of [...res.body.urgent, ...res.body.recentlyUpdated]) {
      expect(Object.keys(row).sort()).toEqual(['id', 'itPriority', 'owner', 'status', 'summary', 'ticketNumber', 'updatedAt'])
      expect(row.owner === null || (typeof row.owner.id === 'number' && typeof row.owner.name === 'string')).toBe(true)
      expect(Object.keys(row.owner ?? { id: 1, name: 'x' }).sort()).toEqual(['id', 'name'])
    }
    expect(res.body.recentlyUpdated[0]).toMatchObject({ summary: 'Dash unassigned latest', owner: null })
  })

  it('myRecentActions are only my own Actions, newest actionAt first, 5 of them, with the text cut at 120 characters', async () => {
    const res = await dash(staff.agent)
    const mine = await ids(prisma.$queryRaw`SELECT id FROM "ActionTaken" WHERE "performedById" = ${staff.user.id} ORDER BY "actionAt" DESC, id DESC LIMIT 5`)
    expect(idsOf(res.body.myRecentActions)).toEqual(mine)
    expect(res.body.myRecentActions).toHaveLength(5)
    for (const a of res.body.myRecentActions) {
      expect(Object.keys(a).sort()).toEqual(['actionAt', 'description', 'id', 'status', 'ticketId', 'ticketNumber'])
      expect(Array.from(a.description as string).length).toBeLessThanOrEqual(120)
    }
    const others = await dash(otherStaff.agent)
    expect(others.body.myRecentActions.map((a: { description: string }) => a.description)).toEqual(['Dash action by someone else'])
  })

  it('cuts a long description to 120 characters ending in an ellipsis, and leaves a short one alone', async () => {
    const long = await prisma.actionTaken.findFirstOrThrow({ where: { performedById: staff.user.id, description: { startsWith: 'Dash action 1 ' } } })
    await prisma.actionTaken.update({ where: { id: long.id }, data: { actionAt: new Date(Date.now() + MIN) } }) // make it the newest
    const res = await dash(staff.agent)
    await prisma.actionTaken.update({ where: { id: long.id }, data: { actionAt: long.actionAt } }) // put it back for the other tests
    const first = res.body.myRecentActions[0]
    expect(first.id).toBe(long.id)
    expect(Array.from(first.description as string)).toHaveLength(120)
    expect(first.description.endsWith('…')).toBe(true)
    expect(res.body.myRecentActions[1].description).toBe('Dash action 2 ')
  })
})

// API-32 (BR-25, AC-26, AC-27)
describe('API-32 the dashboard reflects writes made after the previous call', () => {
  it('claiming a Ticket, changing a status and creating an Action change the counts and lists', async () => {
    const t = await ticket('Dash live change', 'NEW', { priority: 'LOW' })
    const before = (await dash(staff.agent)).body

    const claim = await staff.agent.put(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: staff.user.id })
    expect(claim.status).toBe(200)
    const afterClaim = (await dash(staff.agent)).body
    expect(afterClaim.metrics.unassigned).toBe(before.metrics.unassigned - 1)
    expect(afterClaim.metrics.myActive).toBe(before.metrics.myActive + 1)
    expect(afterClaim.recentlyUpdated[0].id).toBe(t.id)

    const stamp = (await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).updatedAt.toISOString()
    const moved = await staff.agent.put(`/api/staff/tickets/${t.id}/status`).send({ status: 'OPEN', expectedUpdatedAt: stamp })
    expect(moved.status).toBe(200)
    const afterStatus = (await dash(staff.agent)).body
    expect(afterStatus.byStatus.NEW).toBe(before.byStatus.NEW - 1)
    expect(afterStatus.byStatus.OPEN).toBe(before.byStatus.OPEN + 1)

    const made = await staff.agent.post(`/api/staff/tickets/${t.id}/actions`).send({ requestKey: `live-${t.id}`, description: 'Live dashboard action' })
    expect(made.status).toBe(201)
    const afterAction = (await dash(staff.agent)).body
    expect(afterAction.myRecentActions[0]).toMatchObject({ id: made.body.id, ticketId: t.id, description: 'Live dashboard action', status: 'OPEN' })
  })
})

// API-34 (BR-29, AC-28)
describe('API-34 nothing matching for this user', () => {
  it('a staff member with no Tickets and no Actions has zero personal counts, empty personal list, and every key present', async () => {
    const res = await dash(fresh.agent)
    expect(res.status).toBe(200)
    expect(res.body.metrics.myActive).toBe(0)
    expect(res.body.myRecentActions).toEqual([])
    for (const key of ['unassigned', 'requesterReportsResolved']) expect(Number.isInteger(res.body.metrics[key])).toBe(true)
    expect(Object.keys(res.body.byStatus)).toEqual(ALL_STATUSES)
    expect(Object.keys(res.body.byItPriority)).toEqual(PRIORITIES)
    expect(Array.isArray(res.body.urgent)).toBe(true)
    expect(Array.isArray(res.body.recentlyUpdated)).toBe(true)
    expect(res.body).not.toHaveProperty('users')
  })

  it('a status or priority nobody has is 0, not missing', async () => {
    const res = await dash(fresh.agent)
    const total = Object.values(res.body.byStatus as Record<string, number>).reduce((a, b) => a + b, 0)
    expect(total).toBe(await count(prisma.$queryRaw`SELECT count(*) AS n FROM "Ticket"`))
    for (const v of Object.values(res.body.byStatus as Record<string, number>)) expect(v).toBeGreaterThanOrEqual(0)
  })
})

// API-35 (BR-31, AC-30)
describe('API-35 the users card', () => {
  it('is present for an Administrator and equals direct queries; absent for IT Staff', async () => {
    const res = await dash(admin.agent)
    const total = await count(prisma.$queryRaw`SELECT count(*) AS n FROM "User"`)
    const active = await count(prisma.$queryRaw`SELECT count(*) AS n FROM "User" WHERE "isActive" = true`)
    const byRole = await prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT role::text AS k, count(*) AS n FROM "User" GROUP BY 1`
    expect(res.body.users).toEqual({
      total,
      active,
      inactive: total - active,
      byRole: {
        REQUESTER: Number(byRole.find((r) => r.k === 'REQUESTER')?.n ?? 0),
        IT_STAFF: Number(byRole.find((r) => r.k === 'IT_STAFF')?.n ?? 0),
        ADMIN: Number(byRole.find((r) => r.k === 'ADMIN')?.n ?? 0),
      },
    })
    expect(res.body.users.inactive).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify((await dash(staff.agent)).body)).not.toContain('"users"')
  })

  it('an Administrator otherwise gets the same dashboard as IT Staff', async () => {
    const asAdmin = (await dash(admin.agent)).body
    const { users: _users, ...rest } = asAdmin
    expect(Object.keys(rest).sort()).toEqual(Object.keys((await dash(staff.agent)).body).sort())
  })
})

// API-37 (D-12, AC-32)
describe('API-37 the queue filter requesterResolved', () => {
  const queue = (query: string) => staff.agent.get(`/api/staff/tickets?pageSize=50&${query}`)

  it('true keeps only Tickets the requester reported as resolved (Active by default), and total equals a direct count', async () => {
    const res = await queue('requesterResolved=true')
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThan(0)
    expect(res.body.items.every((t: { requesterResolvedAt: string | null; currentStatus: string }) => t.requesterResolvedAt !== null && t.currentStatus !== 'CLOSED' && t.currentStatus !== 'CANCELLED')).toBe(true)
    expect(res.body.items.map((t: { summary: string }) => t.summary)).toContain('Dash reported active')
    expect(res.body.items.map((t: { summary: string }) => t.summary)).not.toContain('Dash reported closed')
    expect(res.body.total).toBe(await directCount(`${ACTIVE_SQL} AND "requesterResolvedAt" IS NOT NULL`))
  })

  it('combines with the other filters; status=all brings the closed one back', async () => {
    const all = await queue('requesterResolved=true&status=all')
    expect(all.body.items.map((t: { summary: string }) => t.summary)).toContain('Dash reported closed')
    const mine = await queue('requesterResolved=true&owner=me')
    expect(mine.body.items.every((t: { owner: { id: number } | null }) => t.owner?.id === staff.user.id)).toBe(true)
    expect((await queue('requesterResolved=true&owner=unassigned')).body.items.map((t: { summary: string }) => t.summary)).not.toContain('Dash reported active')
  })

  it('without the parameter the queue is unchanged (reported and unreported both appear)', async () => {
    const res = await queue('status=all&search=Dash reported')
    expect(res.body.items.map((t: { summary: string }) => t.summary).sort()).toEqual(['Dash reported active', 'Dash reported closed'])
  })

  it.each(['false', '1', 'TRUE', 'yes', 'true,false', ''])('requesterResolved=%s is a 400 on that field', async (value) => {
    const res = await queue(`requesterResolved=${value}`)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'requesterResolved' })
  })
})

// API-38, staff half (BR-30, AC-31)
describe('API-38 each staff card equals its drill-down list', () => {
  const total = async (query: string) => (await staff.agent.get(`/api/staff/tickets?pageSize=1&${query}`)).body.total as number

  it.each([
    ['unassigned', 'owner=unassigned'],
    ['myActive', 'owner=me'],
    ['requesterReportsResolved', 'requesterResolved=true'],
  ] as const)('metrics.%s equals the total of its drill-down (%s)', async (metric, query) => {
    const card = (await dash(staff.agent)).body.metrics[metric]
    expect(await total(query)).toBe(card)
  })

  it.each(ALL_STATUSES)('byStatus.%s equals the total of its status drill-down', async (status) => {
    const card = (await dash(staff.agent)).body.byStatus[status]
    expect(await total(`status=${status}`)).toBe(card)
  })

  it.each(PRIORITIES)('byItPriority.%s equals the total of its priority drill-down', async (priority) => {
    const card = (await dash(staff.agent)).body.byItPriority[priority]
    expect(await total(`priority=${priority}`)).toBe(card)
  })

  it('"View all" for urgent (priority=CRITICAL) contains every urgent row', async () => {
    const urgent = (await dash(staff.agent)).body.urgent as { id: number }[]
    const list = await staff.agent.get('/api/staff/tickets?pageSize=50&priority=CRITICAL')
    const listed = new Set(idsOf(list.body.items))
    for (const row of urgent) expect(listed.has(row.id)).toBe(true)
  })
})
