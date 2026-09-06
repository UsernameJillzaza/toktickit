import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import app from '../../src/app'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const createdTicketIds: number[] = []

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } })
  }
  await prisma.$disconnect()
})

async function createTicketFor(requesterId: number) {
  const category = await prisma.category.findFirstOrThrow()
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow()
  const ticket = await prisma.ticket.create({
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
  createdTicketIds.push(ticket.id)
  return ticket
}

describe('GET /api/tickets/:id', () => {
  it('returns the ticket with category/relatedSystem names and attachments array', async () => {
    const [requesterA] = await prisma.devRequester.findMany({ where: { isActive: true }, take: 1 })
    const ticket = await createTicketFor(requesterA.id)

    const res = await request(app).get(`/api/tickets/${ticket.id}`).query({ requesterId: requesterA.id })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ticket.id)
    expect(res.body.category).toHaveProperty('name')
    expect(res.body.relatedSystem).toHaveProperty('name')
    expect(res.body.attachments).toEqual([])
  })

  // API-15 (AC-03, BR-07): another requester's ticket is a 404, same as not found.
  it('returns 404 when the ticket belongs to a different requester', async () => {
    const [requesterA, requesterB] = await prisma.devRequester.findMany({
      where: { isActive: true },
      take: 2,
    })
    const ticket = await createTicketFor(requesterA.id)

    const res = await request(app).get(`/api/tickets/${ticket.id}`).query({ requesterId: requesterB.id })

    expect(res.status).toBe(404)
  })

  it('returns 404 for a ticket id that does not exist at all', async () => {
    const [requesterA] = await prisma.devRequester.findMany({ where: { isActive: true }, take: 1 })
    const res = await request(app).get('/api/tickets/999999999').query({ requesterId: requesterA.id })
    expect(res.status).toBe(404)
  })
})
