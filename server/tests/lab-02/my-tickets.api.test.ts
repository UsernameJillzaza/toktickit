import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'

// Lab 3 (L3-4): My Tickets is scoped by the session, so each case runs as a
// signed-in Requester and no longer sends requesterId.

let requesterA: { user: TestUser; agent: TestAgent }
let requesterB: { user: TestUser; agent: TestAgent }
let categoryId: number
let relatedSystemId: number

async function createTicket(requesterId: number, summary: string) {
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary,
      description: 'Fixture ticket created for my-tickets.api.test.ts',
      requestedPriority: 'LOW',
      itPriority: 'LOW',
    },
  })
}

beforeAll(async () => {
  requesterA = await createLoggedInUser({ role: 'REQUESTER' })
  requesterB = await createLoggedInUser({ role: 'REQUESTER' })
  categoryId = (await prisma.category.findFirstOrThrow()).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

// API-10 (AC-07, BR-06): each requester only ever sees their own tickets.
describe('GET /api/tickets — ownership', () => {
  it('does not return Requester B tickets when querying as Requester A', async () => {
    await createTicket(requesterA.user.id, 'Ticket that belongs to Requester A')
    const ticketB = await createTicket(requesterB.user.id, 'Ticket that belongs to Requester B')

    const res = await requesterA.agent.get('/api/tickets').query({ pageSize: 50 })

    expect(res.status).toBe(200)
    const ids: number[] = res.body.items.map((t: { id: number }) => t.id)
    expect(ids).not.toContain(ticketB.id)
  })
})

// API-12 (BR-17): pageSize above 50 is capped, not rejected.
describe('GET /api/tickets — pageSize cap', () => {
  it('caps pageSize=999 to 50', async () => {
    const res = await requesterA.agent.get('/api/tickets').query({ pageSize: 999 })

    expect(res.status).toBe(200)
    expect(res.body.pageSize).toBe(50)
  })
})

// API-13 (BR-18): stable ordering — createdAt desc with id desc as the
// tie-breaker for rows created in the same instant.
describe('GET /api/tickets — stable sort', () => {
  it('orders results consistently across repeated identical requests', async () => {
    // Scoped to this test's own fixtures via `search`, so fixtures created
    // by other cases can't land between the two calls.
    const tag = `stablesort-${Math.random().toString(36).slice(2, 10)}`
    for (let i = 0; i < 3; i++) {
      await createTicket(requesterA.user.id, `Stable sort fixture ${i} ${tag}`)
    }

    const query = { pageSize: 50, search: tag }
    const first = await requesterA.agent.get('/api/tickets').query(query)
    const second = await requesterA.agent.get('/api/tickets').query(query)

    const idsFirst = first.body.items.map((t: { id: number }) => t.id)
    const idsSecond = second.body.items.map((t: { id: number }) => t.id)
    expect(idsFirst).toHaveLength(3)
    expect(idsFirst).toEqual(idsSecond)
  })
})

// API-14 (FR-06): search matches the summary text.
describe('GET /api/tickets — search', () => {
  it('finds a ticket by a substring of its summary', async () => {
    await createTicket(requesterA.user.id, 'A very specific searchable phrase xyz123')

    const res = await requesterA.agent
      .get('/api/tickets')
      .query({ search: 'searchable phrase xyz123', pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThanOrEqual(1)
    expect(
      res.body.items.every((t: { summary: string }) => t.summary.includes('searchable phrase xyz123')),
    ).toBe(true)
  })
})

describe('GET /api/tickets — validation', () => {
  // Lab 2 rejected a missing requesterId with 400. In Lab 3 the session is
  // the identity, so the equivalent failure is "no session" → 401.
  it('rejects a request with no session', async () => {
    const res = await request(app).get('/api/tickets')
    expect(res.status).toBe(401)
  })

  it('rejects a non-numeric page', async () => {
    const res = await requesterA.agent.get('/api/tickets').query({ page: 'abc' })
    expect(res.status).toBe(400)
  })
})
