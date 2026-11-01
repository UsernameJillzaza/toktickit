import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { createTicketAs } from '../helpers/tickets'

// Spec 5.5 (authorization matrix, new operations), tested directly on the API:
// hiding a control is never the protection.

let requester: { user: TestUser; agent: TestAgent }
let otherRequester: { user: TestUser; agent: TestAgent }
let staff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }
let ownTicketId: number
let otherTicketId: number
let actionId: number

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  otherRequester = await createLoggedInUser({ role: 'REQUESTER' })
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
  ownTicketId = (await createTicketAs(requester.agent, 'Ticket of the first requester')).id
  otherTicketId = (await createTicketAs(otherRequester.agent, 'Ticket of the second requester')).id
  const made = await staff.agent.post(`/api/staff/tickets/${ownTicketId}/actions`).send({
    requestKey: `auth-${Date.now()}`,
    description: 'Checked the cabling',
    followUpRequired: true,
    followUpNote: 'Look again on Monday',
    attachmentNotes: 'Photo in folder 12',
  })
  expect(made.status).toBe(201)
  actionId = made.body.id
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

/** Every new write/read endpoint in the staff area, as a request factory. */
const staffEndpoints = (ticketId: number, id: number) => [
  { label: 'GET list', send: (a: TestAgent | ReturnType<typeof request>) => a.get(`/api/staff/tickets/${ticketId}/actions`) },
  { label: 'POST create', send: (a: TestAgent | ReturnType<typeof request>) => a.post(`/api/staff/tickets/${ticketId}/actions`).send({ requestKey: 'x-1', description: 'Nope' }) },
  { label: 'PATCH edit', send: (a: TestAgent | ReturnType<typeof request>) => a.patch(`/api/staff/tickets/${ticketId}/actions/${id}`).send({ version: 1, description: 'Nope' }) },
  { label: 'POST complete', send: (a: TestAgent | ReturnType<typeof request>) => a.post(`/api/staff/tickets/${ticketId}/actions/${id}/complete`).send({ version: 1, result: 'Nope' }) },
  { label: 'POST cancel', send: (a: TestAgent | ReturnType<typeof request>) => a.post(`/api/staff/tickets/${ticketId}/actions/${id}/cancel`).send({ version: 1, result: 'Nope' }) },
]

// API-15 (AC-13)
describe('API-15 a Requester cannot use any staff Actions endpoint', () => {
  it('gets 403 on all five, even on their own Ticket, and nothing changes', async () => {
    const before = await prisma.actionTaken.findMany({ where: { ticketId: ownTicketId } })
    for (const e of staffEndpoints(ownTicketId, actionId)) {
      const res = await e.send(requester.agent)
      expect(res.status, e.label).toBe(403)
      expect(res.body.code, e.label).toBe('FORBIDDEN')
    }
    expect(await prisma.actionTaken.findMany({ where: { ticketId: ownTicketId } })).toEqual(before)
  })

  it('the role check runs before any lookup: a missing Ticket is 403 too, not 404', async () => {
    for (const e of staffEndpoints(999999999, 999999999)) {
      expect((await e.send(requester.agent)).status, e.label).toBe(403)
    }
  })

  it('IT Staff and Administrators are allowed on the same endpoints', async () => {
    for (const who of [staff, admin]) {
      expect((await who.agent.get(`/api/staff/tickets/${ownTicketId}/actions`)).status).toBe(200)
    }
  })
})

// API-16 (BR-14, AC-14)
describe('API-16 a Requester reads Actions only on their own Tickets', () => {
  it('sees every field of every Action on their own Ticket', async () => {
    const res = await requester.agent.get(`/api/tickets/${ownTicketId}/actions`)
    expect(res.status).toBe(200)
    expect(res.body.actions).toHaveLength(1)
    expect(res.body.actions[0]).toMatchObject({
      id: actionId,
      description: 'Checked the cabling',
      status: 'OPEN',
      result: null,
      followUpRequired: true,
      followUpNote: 'Look again on Monday',
      attachmentNotes: 'Photo in folder 12',
      performedBy: { id: staff.user.id, name: staff.user.name, role: 'IT_STAFF' },
    })
  })

  it('gets 404 for another Requester’s Ticket and for a missing one — the same answer', async () => {
    const other = await requester.agent.get(`/api/tickets/${otherTicketId}/actions`)
    const missing = await requester.agent.get('/api/tickets/999999999/actions')
    const nonsense = await requester.agent.get('/api/tickets/abc/actions')
    for (const res of [other, missing, nonsense]) {
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    }
    expect(other.body).toEqual(missing.body)
  })

  it('IT Staff and Administrators use the staff endpoint instead: 403 here', async () => {
    for (const who of [staff, admin]) {
      expect((await who.agent.get(`/api/tickets/${ownTicketId}/actions`)).status).toBe(403)
    }
  })

  it('the Requester endpoint is read-only: other methods do not exist', async () => {
    for (const send of [
      () => requester.agent.post(`/api/tickets/${ownTicketId}/actions`).send({ requestKey: 'k', description: 'x' }),
      () => requester.agent.patch(`/api/tickets/${ownTicketId}/actions/${actionId}`).send({ version: 1, description: 'x' }),
      () => requester.agent.delete(`/api/tickets/${ownTicketId}/actions/${actionId}`),
    ]) {
      const res = await send()
      expect(res.status).toBeGreaterThanOrEqual(403)
      expect(res.status).toBeLessThanOrEqual(404)
    }
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } })).version).toBe(1)
  })
})

// API-17 (AC-15)
describe('API-17 signed out, and users who must change their password', () => {
  it('signed-out callers get 401 on every new endpoint', async () => {
    for (const e of staffEndpoints(ownTicketId, actionId)) {
      const res = await e.send(request(app))
      expect(res.status, e.label).toBe(401)
      expect(res.body.code, e.label).toBe('UNAUTHENTICATED')
    }
    expect((await request(app).get(`/api/tickets/${ownTicketId}/actions`)).status).toBe(401)
  })

  it('a staff member and a Requester with mustChangePassword get 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const mustChangeStaff = await createLoggedInUser({ role: 'IT_STAFF', mustChangePassword: true })
    const mustChangeRequester = await createLoggedInUser({ role: 'REQUESTER', mustChangePassword: true })
    for (const e of staffEndpoints(ownTicketId, actionId)) {
      const res = await e.send(mustChangeStaff.agent)
      expect(res.status, e.label).toBe(403)
      expect(res.body.code, e.label).toBe('PASSWORD_CHANGE_REQUIRED')
    }
    const res = await mustChangeRequester.agent.get(`/api/tickets/${ownTicketId}/actions`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })

  it('a deactivated user is signed out on the very next request', async () => {
    const soon = await createLoggedInUser({ role: 'IT_STAFF' })
    expect((await soon.agent.get(`/api/staff/tickets/${ownTicketId}/actions`)).status).toBe(200)
    await prisma.user.update({ where: { id: soon.user.id }, data: { isActive: false } })
    expect((await soon.agent.get(`/api/staff/tickets/${ownTicketId}/actions`)).status).toBe(401)
  })
})

// API-18 (BR-14, AC-16)
describe('API-18 nothing private reaches the Requester', () => {
  it('no Internal Note text and no IT Priority in the Requester’s Actions response', async () => {
    const secret = `confidential-${Date.now()}`
    expect((await staff.agent.post(`/api/staff/tickets/${ownTicketId}/notes`).send({ body: `Do not tell them: ${secret}` })).status).toBe(201)
    const res = await requester.agent.get(`/api/tickets/${ownTicketId}/actions`)
    const text = JSON.stringify(res.body)
    expect(text).not.toContain(secret)
    expect(text).not.toContain('itPriority')
    expect(text).not.toContain('@') // no e-mail addresses either
    expect(Object.keys(res.body)).toEqual(['actions'])
  })

  it('the object a Requester gets has exactly the fields of the one staff get', async () => {
    const asStaff = await staff.agent.get(`/api/staff/tickets/${ownTicketId}/actions`)
    const asRequester = await requester.agent.get(`/api/tickets/${ownTicketId}/actions`)
    expect(asRequester.body.actions).toEqual(asStaff.body.actions)
    expect(Object.keys(asStaff.body.actions[0]).sort()).toEqual(
      ['actionAt', 'attachmentNotes', 'createdAt', 'createdBy', 'description', 'followUpNote', 'followUpRequired', 'id', 'performedBy', 'result', 'status', 'ticketId', 'updatedAt', 'version'].sort(),
    )
  })
})
