import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { createTicketAs, insertTicket } from '../helpers/tickets'

let requester: { user: TestUser; agent: TestAgent }
let otherRequester: { user: TestUser; agent: TestAgent }
let staff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  otherRequester = await createLoggedInUser({ role: 'REQUESTER' })
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

const postComment = (agent: TestAgent, ticketId: number, body: unknown) =>
  agent.post(`/api/tickets/${ticketId}/comments`).send({ body })
const postNote = (agent: TestAgent, ticketId: number, body: unknown) =>
  agent.post(`/api/staff/tickets/${ticketId}/notes`).send({ body })

// API-26 (AC-22, BR-29)
describe('API-26 public comments', () => {
  it('a requester posts, IT Staff reads it with the author and server time', async () => {
    const t = await createTicketAs(requester.agent, 'Ticket for a comment thread')
    const before = Date.now()

    const posted = await requester.agent
      .post(`/api/tickets/${t.id}/comments`)
      .send({ body: '  The error came back this morning.  ', authorId: staff.user.id, createdAt: '2000-01-01' })
    expect(posted.status).toBe(201)
    expect(posted.body).toMatchObject({
      body: 'The error came back this morning.',
      author: { id: requester.user.id, name: requester.user.name, role: 'REQUESTER' },
    })
    expect(new Date(posted.body.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000)

    await postComment(staff.agent, t.id, 'Thanks — looking into it now.')
    const list = await staff.agent.get(`/api/tickets/${t.id}/comments`)
    expect(list.status).toBe(200)
    expect(list.body.map((c: { body: string }) => c.body)).toEqual([
      'The error came back this morning.',
      'Thanks — looking into it now.',
    ])
    expect(list.body[1].author).toMatchObject({ id: staff.user.id, role: 'IT_STAFF' })
    expect(Object.keys(list.body[0]).sort()).toEqual(['author', 'body', 'createdAt', 'id'])
  })

  it('another requester gets 404 for both reading and posting', async () => {
    const t = await createTicketAs(requester.agent, 'Private comment thread')
    expect((await otherRequester.agent.get(`/api/tickets/${t.id}/comments`)).status).toBe(404)
    expect((await postComment(otherRequester.agent, t.id, 'Can I see this?')).status).toBe(404)
    expect(await prisma.publicComment.count({ where: { ticketId: t.id } })).toBe(0)
  })

  it('a new comment moves the ticket’s Last Updated (BR-26)', async () => {
    const t = await insertTicket({ requesterId: requester.user.id, summary: 'Last updated by comment', status: 'OPEN' })
    const old = new Date('2026-01-01T00:00:00.000Z')
    await prisma.ticket.update({ where: { id: t.id }, data: { updatedAt: old } })
    await postComment(admin.agent, t.id, 'Administrator checking in.')
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })
    expect(row.updatedAt.getTime()).toBeGreaterThan(old.getTime())
  })
})

// API-27 (AC-23, AC-04, BR-32)
describe('API-27 internal notes', () => {
  it('staff write and read notes; a requester gets 403 and never sees note text anywhere', async () => {
    const t = await createTicketAs(requester.agent, 'Ticket with an internal note')
    const note = await postNote(staff.agent, t.id, 'Probably the certificate on vpn-02. Do not tell the user yet.')
    expect(note.status).toBe(201)
    expect(note.body.author).toMatchObject({ id: staff.user.id, role: 'IT_STAFF' })

    const adminList = await admin.agent.get(`/api/staff/tickets/${t.id}/notes`)
    expect(adminList.body).toHaveLength(1)

    const blocked = await requester.agent.get(`/api/staff/tickets/${t.id}/notes`)
    expect(blocked.status).toBe(403)
    expect(JSON.stringify(blocked.body)).not.toContain('certificate')
    expect((await postNote(requester.agent, t.id, 'sneaky')).status).toBe(403)

    for (const path of [`/api/tickets/${t.id}`, `/api/tickets/${t.id}/comments`, '/api/tickets']) {
      const res = await requester.agent.get(path)
      expect(JSON.stringify(res.body)).not.toContain('certificate')
    }
  })

  it('404 for a note on a ticket that does not exist', async () => {
    expect((await postNote(staff.agent, 999999999, 'ghost')).status).toBe(404)
  })
})

// API-28 (AC-24, BR-28)
describe('API-28 body validation', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   \n  '],
    ['2001 characters', 'x'.repeat(2001)],
    ['missing', undefined],
    ['not text', 42],
  ])('rejects %s with 400', async (_label, body) => {
    const t = await createTicketAs(requester.agent, 'Validation fixture')
    const comment = await postComment(requester.agent, t.id, body)
    expect(comment.status).toBe(400)
    expect(comment.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'body' })
    const note = await postNote(staff.agent, t.id, body)
    expect(note.status).toBe(400)
    expect(note.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'body' })
  })

  it('accepts exactly 2000 characters', async () => {
    const t = await createTicketAs(requester.agent, 'Boundary fixture')
    expect((await postComment(requester.agent, t.id, 'y'.repeat(2000))).status).toBe(201)
    expect((await postNote(staff.agent, t.id, 'z'.repeat(2000))).status).toBe(201)
  })
})

// API-29 (AC-27, BR-31)
describe('API-29 terminal tickets', () => {
  it('no new public comments on CLOSED or CANCELLED; internal notes still allowed', async () => {
    for (const status of ['CLOSED', 'CANCELLED'] as const) {
      const t = await insertTicket({ requesterId: requester.user.id, summary: `Closed thread ${status}`, status })
      const comment = await postComment(staff.agent, t.id, 'One more thing…')
      expect(comment.status).toBe(409)
      expect(comment.body).toEqual({
        error: 'Comments cannot be added to a closed or cancelled ticket.',
        code: 'TICKET_CLOSED',
      })
      expect((await postNote(staff.agent, t.id, 'Post-mortem note.')).status).toBe(201)
    }
  })
})

// API-30 (AC-26, BR-25)
describe('API-30 "Problem Appears Resolved"', () => {
  it('records the time without changing status; a second press is 409', async () => {
    const t = await insertTicket({ requesterId: requester.user.id, summary: 'Resolved indication', status: 'IN_PROGRESS', ownerId: staff.user.id })

    const first = await requester.agent.post(`/api/tickets/${t.id}/resolved-indication`)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ id: t.id, currentStatus: 'IN_PROGRESS' })
    expect(first.body.requesterResolvedAt).not.toBeNull()
    expect(Object.keys(first.body).sort()).toEqual(['currentStatus', 'id', 'requesterResolvedAt'])

    const again = await requester.agent.post(`/api/tickets/${t.id}/resolved-indication`)
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('ALREADY_INDICATED')

    const staffView = await staff.agent.get(`/api/staff/tickets/${t.id}`)
    expect(staffView.body.requesterResolvedAt).toBe(first.body.requesterResolvedAt)
    expect(staffView.body.currentStatus).toBe('IN_PROGRESS')
  })

  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'] as const)('not allowed while %s → 409 INVALID_STATUS', async (status) => {
    const t = await insertTicket({ requesterId: requester.user.id, summary: `Indication on ${status}`, status, ownerId: staff.user.id })
    const res = await requester.agent.post(`/api/tickets/${t.id}/resolved-indication`)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_STATUS')
  })

  it('only the owning requester: others get 404, staff get 403, and requesters can’t set status', async () => {
    const t = await insertTicket({ requesterId: requester.user.id, summary: 'Indication ownership', status: 'OPEN' })
    expect((await otherRequester.agent.post(`/api/tickets/${t.id}/resolved-indication`)).status).toBe(404)
    expect((await staff.agent.post(`/api/tickets/${t.id}/resolved-indication`)).status).toBe(403)
    expect((await requester.agent.put(`/api/staff/tickets/${t.id}/status`).send({ status: 'RESOLVED' })).status).toBe(403)
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).requesterResolvedAt).toBeNull()
  })

  it('two presses at the same moment record it once', async () => {
    const t = await insertTicket({ requesterId: requester.user.id, summary: 'Double press', status: 'OPEN' })
    const results = await Promise.all([
      requester.agent.post(`/api/tickets/${t.id}/resolved-indication`),
      requester.agent.post(`/api/tickets/${t.id}/resolved-indication`),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })
})

// API-31 (AC-25, BR-30): stored and returned exactly; the client renders text.
describe('API-31 markup is stored verbatim', () => {
  it('returns <script> and <b> exactly as sent (no stripping, no double escaping)', async () => {
    const t = await createTicketAs(requester.agent, 'Markup fixture')
    const body = '<script>alert("x")</script> and <b>bold</b> & "quotes"'
    const posted = await postComment(requester.agent, t.id, body)
    expect(posted.body.body).toBe(body)
    const list = await staff.agent.get(`/api/tickets/${t.id}/comments`)
    expect(list.body[0].body).toBe(body)
  })
})
