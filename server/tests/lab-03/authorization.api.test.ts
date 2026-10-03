import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { createTicketAs, referenceIds, TINY_PNG, uploadAttachmentAs } from '../helpers/tickets'

// Walks spec Section 5.1 row by row. Hiding a button is not access control,
// so every rule is proven here at the API. Staff, comment and admin rows are
// appended by the PRs that add those endpoints (L3-5 … L3-8).

let requesterA: { user: TestUser; agent: TestAgent }
let requesterB: { user: TestUser; agent: TestAgent }
let staff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }
let ticketOfB: { id: number }
let attachmentOfB: { id: number }

beforeAll(async () => {
  requesterA = await createLoggedInUser({ role: 'REQUESTER' })
  requesterB = await createLoggedInUser({ role: 'REQUESTER' })
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
  ticketOfB = await createTicketAs(requesterB.agent, 'Ticket that belongs to B')
  attachmentOfB = await uploadAttachmentAs(requesterB.agent, ticketOfB.id)
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

type Call = { method: 'get' | 'post'; path: () => string; label: string }

const REQUESTER_ONLY: Call[] = [
  { method: 'post', path: () => '/api/tickets', label: 'POST /api/tickets' },
  { method: 'get', path: () => '/api/tickets', label: 'GET /api/tickets' },
  { method: 'get', path: () => `/api/tickets/${ticketOfB.id}`, label: 'GET /api/tickets/:id' },
  { method: 'post', path: () => `/api/tickets/${ticketOfB.id}/attachments`, label: 'POST /api/tickets/:id/attachments' },
  { method: 'post', path: () => `/api/attachments/${attachmentOfB.id}/remove`, label: 'POST /api/attachments/:id/remove' },
]

const PROTECTED: Call[] = [
  ...REQUESTER_ONLY,
  { method: 'get', path: () => `/api/attachments/${attachmentOfB.id}`, label: 'GET /api/attachments/:id' },
  { method: 'get', path: () => `/api/attachments/${attachmentOfB.id}/download`, label: 'GET /api/attachments/:id/download' },
  { method: 'get', path: () => '/api/auth/me', label: 'GET /api/auth/me' },
  { method: 'post', path: () => '/api/auth/logout', label: 'POST /api/auth/logout' },
  { method: 'post', path: () => '/api/auth/change-password', label: 'POST /api/auth/change-password' },
]

// API-10 (AC-09)
describe('API-10 no session', () => {
  it.each(PROTECTED.map((c) => [c.label, c] as const))('%s → 401 UNAUTHENTICATED', async (_label, call) => {
    const res = await request(app)[call.method](call.path()).send({})
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Authentication required.', code: 'UNAUTHENTICATED' })
  })

  it('public reference endpoints still work signed out', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200)
    expect((await request(app).get('/api/categories')).status).toBe(200)
    expect((await request(app).get('/api/related-systems')).status).toBe(200)
  })
})

// API-11 (AC-10, AC-35, BR-15): wrong role → 403 before any lookup, so the
// body reveals nothing about the resource.
describe('API-11 wrong role', () => {
  for (const who of ['IT_STAFF', 'ADMIN'] as const) {
    it.each(REQUESTER_ONLY.map((c) => [c.label, c] as const))(`${who}: %s → 403 FORBIDDEN`, async (_label, call) => {
      const agent = who === 'IT_STAFF' ? staff.agent : admin.agent
      const res = await agent[call.method](call.path()).send({})
      expect(res.status).toBe(403)
      expect(res.body).toEqual({
        error: 'You do not have permission to perform this action.',
        code: 'FORBIDDEN',
      })
    })
  }
})

// API-12 (AC-03, BR-03): requesterId from the client is ignored.
describe('API-12 requesterId is ignored', () => {
  it('lists only the signed-in requester’s tickets even when another id is sent', async () => {
    const res = await requesterA.agent.get(`/api/tickets?requesterId=${requesterB.user.id}`)
    expect(res.status).toBe(200)
    expect(res.body.items.map((t: { id: number }) => t.id)).not.toContain(ticketOfB.id)
    expect(res.body.items.every((t: { requesterId: number }) => t.requesterId === requesterA.user.id)).toBe(true)
  })

  it('creates the ticket for the signed-in requester, not the requesterId in the body', async () => {
    const res = await requesterA.agent.post('/api/tickets').send({
      ...(await referenceIds()),
      requesterId: requesterB.user.id,
      summary: 'Monitor flickers after lunch',
      description: 'Flickers every few seconds.',
      requestedPriority: 'LOW',
    })
    expect(res.status).toBe(201)
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(row.requesterId).toBe(requesterA.user.id)
  })
})

// API-13 (AC-13, BR-16): another requester's resources are indistinguishable
// from resources that don't exist.
describe('API-13 other requester’s resources → 404', () => {
  it('ticket detail', async () => {
    const res = await requesterA.agent.get(`/api/tickets/${ticketOfB.id}`)
    expect(res.status).toBe(404)
  })

  it('attachment metadata and download', async () => {
    expect((await requesterA.agent.get(`/api/attachments/${attachmentOfB.id}`)).status).toBe(404)
    expect((await requesterA.agent.get(`/api/attachments/${attachmentOfB.id}/download`)).status).toBe(404)
  })

  it('upload and remove change nothing', async () => {
    const upload = await requesterA.agent
      .post(`/api/tickets/${ticketOfB.id}/attachments`)
      .attach('file', TINY_PNG, { filename: 'x.png', contentType: 'image/png' })
    expect(upload.status).toBe(404)

    const remove = await requesterA.agent
      .post(`/api/attachments/${attachmentOfB.id}/remove`)
      .send({ reason: 'not mine to remove' })
    expect(remove.status).toBe(404)
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentOfB.id } })
    expect(row.isRemoved).toBe(false)
    expect(await prisma.attachment.count({ where: { ticketId: ticketOfB.id } })).toBe(1)
  })
})

// Section 5.1 "Attachment metadata / download": IT Staff and Admin can read
// attachments on any Ticket; a removed file still 404s on download.
describe('5.1 staff attachment access', () => {
  it('IT Staff and Admin can read metadata and download any ticket’s attachment', async () => {
    for (const agent of [staff.agent, admin.agent]) {
      const meta = await agent.get(`/api/attachments/${attachmentOfB.id}`)
      expect(meta.status).toBe(200)
      expect(meta.body.filename).toBe('screen.png')
      const file = await agent.get(`/api/attachments/${attachmentOfB.id}/download`)
      expect(file.status).toBe(200)
    }
  })

  it('a removed attachment keeps its metadata but cannot be downloaded by staff', async () => {
    const ticket = await createTicketAs(requesterB.agent, 'Ticket with a removed file')
    const att = await uploadAttachmentAs(requesterB.agent, ticket.id)
    await requesterB.agent.post(`/api/attachments/${att.id}/remove`).send({ reason: 'wrong screenshot' })

    const meta = await staff.agent.get(`/api/attachments/${att.id}`)
    expect(meta.status).toBe(200)
    expect(meta.body.isRemoved).toBe(true)
    expect((await staff.agent.get(`/api/attachments/${att.id}/download`)).status).toBe(404)
  })
})

// API-14 (BR-42)
describe('API-14 Development Requester endpoint removed', () => {
  it('GET /api/requesters → 404 with the standard error shape', async () => {
    const res = await requesterA.agent.get('/api/requesters')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
