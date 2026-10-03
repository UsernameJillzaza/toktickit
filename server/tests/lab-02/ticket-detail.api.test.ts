import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'

// Lab 3 (L3-4): requests run as a signed-in Requester; "querying as B" now
// means "B's session", not a requesterId query parameter.

let requesterA: { user: TestUser; agent: TestAgent }
let requesterB: { user: TestUser; agent: TestAgent }

beforeAll(async () => {
  requesterA = await createLoggedInUser({ role: 'REQUESTER' })
  requesterB = await createLoggedInUser({ role: 'REQUESTER' })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

async function createTicketFor(requesterId: number) {
  const category = await prisma.category.findFirstOrThrow()
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow()
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-${Math.random().toString(36).slice(2, 10)}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: 'Fixture ticket for ticket-detail.api.test.ts',
      description: 'Created only to exercise GET /api/tickets/:id.',
      requestedPriority: 'LOW',
    },
  })
}

describe('GET /api/tickets/:id', () => {
  it('returns the ticket with category/relatedSystem names and attachments array', async () => {
    const ticket = await createTicketFor(requesterA.user.id)

    const res = await requesterA.agent.get(`/api/tickets/${ticket.id}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ticket.id)
    expect(res.body.category).toHaveProperty('name')
    expect(res.body.relatedSystem).toHaveProperty('name')
    expect(res.body.attachments).toEqual([])
  })

  // API-15 (AC-03, BR-07): another requester's ticket is a 404, same as not found.
  it('returns 404 when the ticket belongs to a different requester', async () => {
    const ticket = await createTicketFor(requesterA.user.id)

    const res = await requesterB.agent.get(`/api/tickets/${ticket.id}`)

    expect(res.status).toBe(404)
  })

  it('returns 404 for a ticket id that does not exist at all', async () => {
    const res = await requesterA.agent.get('/api/tickets/999999999')
    expect(res.status).toBe(404)
  })
})
