import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser, createTestUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { createTicketAs, insertTicket, uploadAttachmentAs } from '../helpers/tickets'

let staff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }
let requester: { user: TestUser; agent: TestAgent }
let otherStaff: TestUser
let inactiveStaff: TestUser

beforeAll(async () => {
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  otherStaff = await createTestUser({ role: 'IT_STAFF' })
  inactiveStaff = await createTestUser({ role: 'IT_STAFF', isActive: false })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

function ticketFor(options: Omit<Parameters<typeof insertTicket>[0], 'requesterId' | 'summary'> = {}) {
  return insertTicket({ requesterId: requester.user.id, summary: 'Staff operations fixture', ...options })
}

const setOwner = (agent: TestAgent, id: number, ownerId: unknown) =>
  agent.put(`/api/staff/tickets/${id}/owner`).send({ ownerId })
const setStatus = (agent: TestAgent, id: number, status: unknown) =>
  agent.put(`/api/staff/tickets/${id}/status`).send({ status })
const setPriority = (agent: TestAgent, id: number, itPriority: unknown) =>
  agent.put(`/api/staff/tickets/${id}/it-priority`).send({ itPriority })

// API-19 (FR-12)
describe('API-19 staff ticket detail', () => {
  it('includes requester, owner, attachments and the allowed transitions', async () => {
    const created = await createTicketAs(requester.agent, 'Detail fixture with an attachment')
    await uploadAttachmentAs(requester.agent, created.id)
    await prisma.ticket.update({ where: { id: created.id }, data: { currentStatus: 'OPEN', ownerId: staff.user.id } })

    const res = await staff.agent.get(`/api/staff/tickets/${created.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: created.id,
      currentStatus: 'OPEN',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      requesterResolvedAt: null,
      requester: { id: requester.user.id, name: requester.user.name, email: requester.user.email },
      owner: { id: staff.user.id, name: staff.user.name, role: 'IT_STAFF', isActive: true },
      allowedTransitions: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    })
    expect(res.body.category).toHaveProperty('name')
    expect(res.body.relatedSystem).toHaveProperty('name')
    expect(res.body.attachments).toHaveLength(1)
    expect(res.body.attachments[0]).not.toHaveProperty('storagePath')
  })

  it('404 for a ticket that does not exist', async () => {
    const res = await staff.agent.get('/api/staff/tickets/999999999')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('lists active IT Staff and Administrators as assignees, never requesters or inactive users', async () => {
    const res = await staff.agent.get('/api/staff/assignees')
    expect(res.status).toBe(200)
    const ids = res.body.map((u: { id: number }) => u.id)
    expect(ids).toEqual(expect.arrayContaining([staff.user.id, admin.user.id, otherStaff.id]))
    expect(ids).not.toContain(requester.user.id)
    expect(ids).not.toContain(inactiveStaff.id)
    expect(res.body.every((u: { role: string }) => u.role === 'IT_STAFF' || u.role === 'ADMIN')).toBe(true)
  })
})

// API-20 (AC-17, BR-18, BR-19)
describe('API-20 claim, reassign, unassign', () => {
  it('claims, reassigns to an Administrator, and unassigns', async () => {
    const t = await ticketFor({ status: 'OPEN' })

    const claim = await setOwner(staff.agent, t.id, staff.user.id)
    expect(claim.status).toBe(200)
    expect(claim.body.owner).toMatchObject({ id: staff.user.id })
    expect(claim.body).toHaveProperty('allowedTransitions')

    const reassign = await setOwner(staff.agent, t.id, admin.user.id)
    expect(reassign.body.owner).toMatchObject({ id: admin.user.id, role: 'ADMIN' })

    const unassign = await setOwner(admin.agent, t.id, null)
    expect(unassign.status).toBe(200)
    expect(unassign.body.owner).toBeNull()
  })

  it.each([
    ['an inactive IT Staff member', () => inactiveStaff.id],
    ['a Requester', () => requester.user.id],
    ['a user that does not exist', () => 999999999],
    ['a non-integer', () => 'eight'],
  ])('rejects %s with 400 ASSIGNEE_INVALID', async (_label, ownerId) => {
    const t = await ticketFor({ status: 'OPEN' })
    const res = await setOwner(staff.agent, t.id, ownerId())
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'ASSIGNEE_INVALID', field: 'ownerId' })
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).ownerId).toBeNull()
  })

  it('keeps a deactivated owner on an existing ticket (BR-38)', async () => {
    const t = await ticketFor({ status: 'OPEN', ownerId: inactiveStaff.id })
    const res = await staff.agent.get(`/api/staff/tickets/${t.id}`)
    expect(res.body.owner).toMatchObject({ id: inactiveStaff.id, isActive: false })
  })
})

// API-21 (AC-18, BR-21)
describe('API-21 IT priority', () => {
  it('IT Staff sets IT Priority (CRITICAL allowed); Requested Priority never changes', async () => {
    const t = await ticketFor({ status: 'OPEN', itPriority: 'LOW' })
    const res = await setPriority(staff.agent, t.id, 'CRITICAL')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ itPriority: 'CRITICAL', requestedPriority: 'LOW' })
  })

  it('rejects an unknown priority with 400', async () => {
    const t = await ticketFor({ status: 'OPEN' })
    const res = await setPriority(staff.agent, t.id, 'URGENT')
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'itPriority' })
  })

  it('a Requester gets 403 on every staff mutation, even for their own ticket', async () => {
    const t = await ticketFor({ status: 'OPEN' })
    expect((await setPriority(requester.agent, t.id, 'HIGH')).status).toBe(403)
    expect((await setOwner(requester.agent, t.id, staff.user.id)).status).toBe(403)
    expect((await setStatus(requester.agent, t.id, 'CANCELLED')).status).toBe(403)
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).itPriority).toBe('LOW')
  })
})

// API-22 (AC-19, BR-22, BR-23)
describe('API-22 status transitions', () => {
  it('follows the matrix', async () => {
    const t = await ticketFor({ status: 'NEW', ownerId: staff.user.id })
    const open = await setStatus(staff.agent, t.id, 'OPEN')
    expect(open.status).toBe(200)
    expect(open.body.currentStatus).toBe('OPEN')
    expect(open.body.allowedTransitions).toEqual(['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'])
    expect((await setStatus(staff.agent, t.id, 'IN_PROGRESS')).body.currentStatus).toBe('IN_PROGRESS')
  })

  it('rejects a move outside the matrix, and the same status, with 409 INVALID_TRANSITION', async () => {
    const t = await ticketFor({ status: 'NEW' })
    const skip = await setStatus(staff.agent, t.id, 'CLOSED')
    expect(skip.status).toBe(409)
    expect(skip.body).toEqual({ error: 'Cannot change status from NEW to CLOSED.', code: 'INVALID_TRANSITION' })
    expect((await setStatus(staff.agent, t.id, 'NEW')).body.code).toBe('INVALID_TRANSITION')
  })

  it('needs an owner for IN_PROGRESS / WAITING_FOR_REQUESTER / RESOLVED → 409 OWNER_REQUIRED', async () => {
    const t = await ticketFor({ status: 'OPEN' })
    for (const status of ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED']) {
      const res = await setStatus(staff.agent, t.id, status)
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('OWNER_REQUIRED')
    }
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).currentStatus).toBe('OPEN')
  })

  it('refuses to unassign while the status needs an owner', async () => {
    const t = await ticketFor({ status: 'IN_PROGRESS', ownerId: staff.user.id })
    const res = await setOwner(staff.agent, t.id, null)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('OWNER_REQUIRED')
  })

  it('rejects an unknown status with 400', async () => {
    const t = await ticketFor({ status: 'OPEN' })
    const res = await setStatus(staff.agent, t.id, 'DONE')
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'status' })
  })

  it('cannot slip into "IN_PROGRESS with no owner" when unassign and status change race', async () => {
    // Both requests read the ticket at the same time. Without a row lock, the
    // unassign could see OPEN and the status change could see an owner, and
    // both would succeed.
    for (let i = 0; i < 5; i++) {
      const t = await ticketFor({ status: 'OPEN', ownerId: staff.user.id })
      await Promise.all([setOwner(staff.agent, t.id, null), setStatus(admin.agent, t.id, 'IN_PROGRESS')])
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })
      expect(row.currentStatus === 'IN_PROGRESS' && row.ownerId === null).toBe(false)
    }
  })
})

// API-23 (AC-21, BR-20)
describe('API-23 terminal tickets', () => {
  it('a CLOSED ticket can no longer change owner, IT priority or status', async () => {
    const t = await ticketFor({ status: 'CLOSED', ownerId: staff.user.id, itPriority: 'LOW' })

    const owner = await setOwner(staff.agent, t.id, admin.user.id)
    expect(owner.status).toBe(409)
    expect(owner.body.code).toBe('TICKET_TERMINAL')

    const priority = await setPriority(staff.agent, t.id, 'HIGH')
    expect(priority.status).toBe(409)
    expect(priority.body.code).toBe('TICKET_TERMINAL')

    const status = await setStatus(staff.agent, t.id, 'REOPENED')
    expect(status.status).toBe(409)
    expect(status.body.code).toBe('INVALID_TRANSITION')

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })
    expect(row).toMatchObject({ ownerId: staff.user.id, itPriority: 'LOW', currentStatus: 'CLOSED' })
  })

  it('a CANCELLED ticket offers no transitions', async () => {
    const t = await ticketFor({ status: 'CANCELLED' })
    const res = await staff.agent.get(`/api/staff/tickets/${t.id}`)
    expect(res.body.allowedTransitions).toEqual([])
  })
})

// API-24 (FR-18)
describe('API-24 staff attachment download', () => {
  it('IT Staff downloads a requester’s file; a removed one is 404', async () => {
    const created = await createTicketAs(requester.agent, 'Ticket with a screenshot')
    const att = await uploadAttachmentAs(requester.agent, created.id)

    const file = await staff.agent.get(`/api/attachments/${att.id}/download`)
    expect(file.status).toBe(200)
    expect(Number(file.headers['content-length'])).toBeGreaterThan(0)

    await requester.agent.post(`/api/attachments/${att.id}/remove`).send({ reason: 'wrong file attached' })
    expect((await staff.agent.get(`/api/attachments/${att.id}/download`)).status).toBe(404)
  })
})

// API-25 (BR-25, BR-26)
describe('API-25 side effects', () => {
  it('moving to REOPENED clears "requester reports resolved"', async () => {
    const t = await ticketFor({ status: 'RESOLVED', ownerId: staff.user.id })
    await prisma.ticket.update({ where: { id: t.id }, data: { requesterResolvedAt: new Date() } })

    const res = await setStatus(staff.agent, t.id, 'REOPENED')
    expect(res.status).toBe(200)
    expect(res.body.requesterResolvedAt).toBeNull()
  })

  it('every mutation moves Last Updated forward', async () => {
    const t = await ticketFor({ status: 'NEW' })
    const old = new Date('2026-01-01T00:00:00.000Z')
    const stale = () => prisma.ticket.update({ where: { id: t.id }, data: { updatedAt: old } })

    await stale()
    const a = await setOwner(staff.agent, t.id, staff.user.id)
    expect(new Date(a.body.updatedAt).getTime()).toBeGreaterThan(old.getTime())

    await stale()
    const b = await setPriority(staff.agent, t.id, 'HIGH')
    expect(new Date(b.body.updatedAt).getTime()).toBeGreaterThan(old.getTime())

    await stale()
    const c = await setStatus(staff.agent, t.id, 'OPEN')
    expect(new Date(c.body.updatedAt).getTime()).toBeGreaterThan(old.getTime())
  })
})
