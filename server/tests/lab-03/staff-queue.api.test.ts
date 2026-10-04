import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser, createTestUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { insertTicket } from '../helpers/tickets'

// Every query carries `search=<tag>` so only this file's tickets are counted,
// whatever else lives in the shared dev database.

const TAG = `queue-${randomBytes(4).toString('hex')}`

let staff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }
let requester: TestUser
let otherCategoryId: number
const t: Record<string, { id: number; ticketNumber: string }> = {}

type Item = {
  id: number
  currentStatus: string
  itPriority: string
  owner: { id: number; name: string } | null
  requester: { id: number; name: string; email: string }
}

function queue(agent: TestAgent, query: Record<string, string | number> = {}) {
  return agent.get('/api/staff/tickets').query({ search: TAG, ...query })
}

function ids(body: { items: Item[] }) {
  return body.items.map((i) => i.id)
}

beforeAll(async () => {
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
  requester = await createTestUser({ role: 'REQUESTER', name: `Queue Requester ${TAG}` })
  const categories = await prisma.category.findMany({ orderBy: { id: 'asc' }, take: 2 })
  otherCategoryId = categories[1].id

  // Created in this order, so createdAt ascends: newOpen … cancelled.
  t.newLow = await insertTicket({ requesterId: requester.id, summary: `${TAG} new low`, status: 'NEW', itPriority: 'LOW' })
  t.openMine = await insertTicket({ requesterId: requester.id, summary: `${TAG} open mine`, status: 'OPEN', itPriority: 'MEDIUM', ownerId: staff.user.id })
  t.progressAdmin = await insertTicket({ requesterId: requester.id, summary: `${TAG} in progress admin`, status: 'IN_PROGRESS', itPriority: 'HIGH', ownerId: admin.user.id, categoryId: otherCategoryId })
  t.critical = await insertTicket({ requesterId: requester.id, summary: `${TAG} critical`, status: 'OPEN', itPriority: 'CRITICAL' })
  t.closed = await insertTicket({ requesterId: requester.id, summary: `${TAG} closed`, status: 'CLOSED', itPriority: 'LOW', ownerId: staff.user.id })
  t.cancelled = await insertTicket({ requesterId: requester.id, summary: `${TAG} cancelled`, status: 'CANCELLED', itPriority: 'LOW' })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

// API-15 (AC-14, BR-43)
describe('API-15 default queue', () => {
  it('shows active tickets only, newest first, with requester / owner / IT priority', async () => {
    const res = await queue(staff.agent)
    expect(res.status).toBe(200)
    expect(ids(res.body)).toEqual([t.critical.id, t.progressAdmin.id, t.openMine.id, t.newLow.id])
    expect(res.body).toMatchObject({ page: 1, pageSize: 10, total: 4 })

    const item = res.body.items.find((i: Item) => i.id === t.openMine.id)
    expect(item).toMatchObject({
      ticketNumber: t.openMine.ticketNumber,
      currentStatus: 'OPEN',
      itPriority: 'MEDIUM',
      requesterResolvedAt: null,
      requester: { id: requester.id, name: requester.name, email: requester.email },
      owner: { id: staff.user.id, name: staff.user.name },
    })
    expect(item).toHaveProperty('updatedAt')
    expect(item).toHaveProperty('requestedPriority')
    expect(item.category).toHaveProperty('name')
    expect(item).not.toHaveProperty('description')
    expect(res.body.items.find((i: Item) => i.id === t.newLow.id).owner).toBeNull()
  })

  it('Administrators see the same queue (BR-17)', async () => {
    const res = await queue(admin.agent)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(4)
  })
})

// API-16 (AC-15, BR-44)
describe('API-16 filters and search', () => {
  it('status: one value, or all', async () => {
    expect(ids((await queue(staff.agent, { status: 'CLOSED' })).body)).toEqual([t.closed.id])
    expect((await queue(staff.agent, { status: 'all' })).body.total).toBe(6)
  })

  it('owner: me, unassigned, or a user id', async () => {
    expect(ids((await queue(staff.agent, { owner: 'me' })).body)).toEqual([t.openMine.id])
    expect(ids((await queue(admin.agent, { owner: 'me' })).body)).toEqual([t.progressAdmin.id])
    expect(ids((await queue(staff.agent, { owner: 'unassigned' })).body)).toEqual([t.critical.id, t.newLow.id])
    expect(ids((await queue(staff.agent, { owner: admin.user.id })).body)).toEqual([t.progressAdmin.id])
  })

  it('IT priority and category', async () => {
    expect(ids((await queue(staff.agent, { priority: 'CRITICAL' })).body)).toEqual([t.critical.id])
    expect(ids((await queue(staff.agent, { categoryId: otherCategoryId })).body)).toEqual([t.progressAdmin.id])
  })

  it('search matches ticket number, summary, requester name and requester email, ignoring case', async () => {
    const byNumber = await staff.agent.get('/api/staff/tickets').query({ search: t.critical.ticketNumber.toLowerCase() })
    expect(ids(byNumber.body)).toEqual([t.critical.id])

    const bySummary = await staff.agent.get('/api/staff/tickets').query({ search: `${TAG} IN PROGRESS` })
    expect(ids(bySummary.body)).toEqual([t.progressAdmin.id])

    const byName = await staff.agent.get('/api/staff/tickets').query({ search: `queue requester ${TAG}` })
    expect(byName.body.total).toBe(4)

    const byEmail = await staff.agent.get('/api/staff/tickets').query({ search: requester.email.toUpperCase() })
    expect(byEmail.body.total).toBe(4)
  })
})

// API-17 (AC-15, D-09)
describe('API-17 sorting and pagination', () => {
  it('itPriority:desc puts CRITICAL first, then HIGH, MEDIUM, LOW', async () => {
    const res = await queue(staff.agent, { sort: 'itPriority:desc' })
    expect(res.body.items.map((i: Item) => i.itPriority)).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  })

  it('createdAt:asc and ticketNumber sort both work', async () => {
    const asc = await queue(staff.agent, { sort: 'createdAt:asc' })
    expect(ids(asc.body)).toEqual([t.newLow.id, t.openMine.id, t.progressAdmin.id, t.critical.id])
    const byNumber = await queue(staff.agent, { sort: 'ticketNumber:asc' })
    expect(byNumber.status).toBe(200)
    expect(byNumber.body.total).toBe(4)
  })

  it('pages through results and caps pageSize at 50', async () => {
    const first = await queue(staff.agent, { pageSize: 3 })
    const second = await queue(staff.agent, { pageSize: 3, page: 2 })
    expect(first.body).toMatchObject({ page: 1, pageSize: 3, total: 4 })
    expect(first.body.items).toHaveLength(3)
    expect(ids(second.body)).toEqual([t.newLow.id])

    const capped = await queue(staff.agent, { pageSize: 999 })
    expect(capped.body.pageSize).toBe(50)
  })
})

// API-18 (AC-15, BR-43): unknown values are a 400 that names the parameter.
describe('API-18 invalid parameters', () => {
  it.each([
    ['status', 'BOGUS'],
    ['sort', 'foo:up'],
    ['sort', 'summary:asc'],
    ['page', '0'],
    ['pageSize', 'abc'],
    ['owner', 'abc'],
    ['priority', 'URGENT'],
    ['categoryId', 'x'],
  ])('%s=%s → 400 VALIDATION_ERROR', async (field, value) => {
    const res = await queue(staff.agent, { [field]: value })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field })
  })
})
