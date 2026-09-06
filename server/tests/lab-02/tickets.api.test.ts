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

async function validPayload() {
  const requester = await prisma.devRequester.findFirstOrThrow({ where: { isActive: true } })
  const category = await prisma.category.findFirstOrThrow()
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow()
  return {
    requesterId: requester.id,
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    summary: 'Laptop battery drains quickly',
    description: 'The battery goes from 100% to 20% within an hour of normal use.',
    requestedPriority: 'MEDIUM',
  }
}

// API-02 (AC-01): valid input creates a Ticket and returns its Ticket Number.
describe('POST /api/tickets — valid input', () => {
  it('returns 201 with the created ticket and a generated ticketNumber', async () => {
    const payload = await validPayload()
    const res = await request(app).post('/api/tickets').send(payload)

    expect(res.status).toBe(201)
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)
    expect(res.body.currentStatus).toBe('NEW')
    expect(res.body.requesterId).toBe(payload.requesterId)

    createdTicketIds.push(res.body.id)
  })
})

// API-03 (AC-04, BR-08): missing/too-short summary is rejected, nothing created.
describe('POST /api/tickets — missing summary', () => {
  it('returns 400 and does not create a ticket', async () => {
    const payload = await validPayload()
    // Check for this test's own rejected summary specifically, rather than a
    // global prisma.ticket.count() before/after — other test files insert
    // fixtures concurrently against the same shared dev DB, so a global
    // count is flaky under that parallelism (this test used to compare
    // global counts and failed intermittently once my-tickets.api.test.ts
    // started creating fixtures at the same time).
    const rejectedSummary = 'short'

    const res = await request(app)
      .post('/api/tickets')
      .send({ ...payload, summary: rejectedSummary })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('summary')

    const created = await prisma.ticket.findFirst({ where: { summary: rejectedSummary } })
    expect(created).toBeNull()
  })
})

// API-04 (BR-09): unrecognized requestedPriority is rejected.
describe('POST /api/tickets — invalid requestedPriority', () => {
  it('returns 400 with a clear error message', async () => {
    const payload = await validPayload()

    const res = await request(app)
      .post('/api/tickets')
      .send({ ...payload, requestedPriority: 'URGENT' })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('requestedPriority')
  })
})

// BR-06 groundwork: an inactive requester cannot be used to create a ticket
// (mirrors the selector's exclusion rule at the write path, not just reads).
describe('POST /api/tickets — inactive requester', () => {
  it('returns 404', async () => {
    const inactive = await prisma.devRequester.findFirstOrThrow({ where: { isActive: false } })
    const payload = await validPayload()

    const res = await request(app)
      .post('/api/tickets')
      .send({ ...payload, requesterId: inactive.id })

    expect(res.status).toBe(404)
  })
})
