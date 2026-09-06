import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import app from '../../src/app'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const createdTicketIds: number[] = []
let requesterA: { id: number }
let requesterB: { id: number }
let categoryId: number
let relatedSystemId: number

async function createTicket(requesterId: number, summary: string) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary,
      description: 'Fixture ticket created for my-tickets.api.test.ts',
      requestedPriority: 'LOW',
    },
  })
  createdTicketIds.push(ticket.id)
  return ticket
}

beforeAll(async () => {
  const requesters = await prisma.devRequester.findMany({ where: { isActive: true }, take: 2 })
  requesterA = requesters[0]
  requesterB = requesters[1]
  categoryId = (await prisma.category.findFirstOrThrow()).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id
})

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } })
  }
  await prisma.$disconnect()
})

// API-10 (AC-07, BR-06): each requester only ever sees their own tickets.
describe('GET /api/tickets — ownership', () => {
  it('does not return Requester B tickets when querying as Requester A', async () => {
    await createTicket(requesterA.id, 'Ticket that belongs to Requester A')
    const ticketB = await createTicket(requesterB.id, 'Ticket that belongs to Requester B')

    const res = await request(app).get('/api/tickets').query({ requesterId: requesterA.id, pageSize: 50 })

    expect(res.status).toBe(200)
    const ids: number[] = res.body.items.map((t: { id: number }) => t.id)
    expect(ids).not.toContain(ticketB.id)
  })
})

// API-12 (BR-17): pageSize above 50 is capped, not rejected.
describe('GET /api/tickets — pageSize cap', () => {
  it('caps pageSize=999 to 50', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .query({ requesterId: requesterA.id, pageSize: 999 })

    expect(res.status).toBe(200)
    expect(res.body.pageSize).toBe(50)
  })
})

// API-13 (BR-18): stable ordering — createdAt desc with id desc as the
// tie-breaker for rows created in the same instant.
describe('GET /api/tickets — stable sort', () => {
  it('orders results consistently across repeated identical requests', async () => {
    // Scoped to this test's own fixtures via `search` — other test files
    // (and even other `it` blocks here) create tickets for the same
    // requester concurrently against the shared dev DB, so a query with no
    // scoping would flake whenever a fixture landed between the two calls.
    const tag = `stablesort-${Math.random().toString(36).slice(2, 10)}`
    for (let i = 0; i < 3; i++) {
      await createTicket(requesterA.id, `Stable sort fixture ${i} ${tag}`)
    }

    const query = { requesterId: requesterA.id, pageSize: 50, search: tag }
    const first = await request(app).get('/api/tickets').query(query)
    const second = await request(app).get('/api/tickets').query(query)

    const idsFirst = first.body.items.map((t: { id: number }) => t.id)
    const idsSecond = second.body.items.map((t: { id: number }) => t.id)
    expect(idsFirst).toHaveLength(3)
    expect(idsFirst).toEqual(idsSecond)
  })
})

// API-14 (FR-06): search matches the summary text.
describe('GET /api/tickets — search', () => {
  it('finds a ticket by a substring of its summary', async () => {
    await createTicket(requesterA.id, 'A very specific searchable phrase xyz123')

    const res = await request(app)
      .get('/api/tickets')
      .query({ requesterId: requesterA.id, search: 'searchable phrase xyz123', pageSize: 50 })

    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThanOrEqual(1)
    expect(
      res.body.items.every((t: { summary: string }) => t.summary.includes('searchable phrase xyz123')),
    ).toBe(true)
  })
})

describe('GET /api/tickets — validation', () => {
  it('rejects a missing requesterId', async () => {
    const res = await request(app).get('/api/tickets')
    expect(res.status).toBe(400)
  })

  it('rejects a non-numeric page', async () => {
    const res = await request(app).get('/api/tickets').query({ requesterId: requesterA.id, page: 'abc' })
    expect(res.status).toBe(400)
  })
})
