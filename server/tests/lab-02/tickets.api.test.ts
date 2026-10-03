import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'

// Lab 3 (L3-4): these Lab 2 cases now run as a signed-in Requester. The
// requester comes from the session; the body no longer carries requesterId.

let requester: { user: TestUser; agent: TestAgent }

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

async function validPayload() {
  const category = await prisma.category.findFirstOrThrow()
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow()
  return {
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
    const res = await requester.agent.post('/api/tickets').send(await validPayload())

    expect(res.status).toBe(201)
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)
    expect(res.body.currentStatus).toBe('NEW')
    expect(res.body.requesterId).toBe(requester.user.id)
  })
})

// API-03 (AC-04, BR-08): missing/too-short summary is rejected, nothing created.
describe('POST /api/tickets — missing summary', () => {
  it('returns 400 and does not create a ticket', async () => {
    // Checks for this test's own rejected summary rather than a global
    // count, which other suites sharing the dev DB could change.
    const rejectedSummary = 'short'

    const res = await requester.agent
      .post('/api/tickets')
      .send({ ...(await validPayload()), summary: rejectedSummary })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('summary')

    const created = await prisma.ticket.findFirst({ where: { summary: rejectedSummary } })
    expect(created).toBeNull()
  })
})

// API-04 (BR-09): unrecognized requestedPriority is rejected.
describe('POST /api/tickets — invalid requestedPriority', () => {
  it('returns 400 with a clear error message', async () => {
    const res = await requester.agent
      .post('/api/tickets')
      .send({ ...(await validPayload()), requestedPriority: 'URGENT' })

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('requestedPriority')
  })
})

// BR-06 groundwork, Lab 3 form: an inactive requester still cannot create a
// ticket. Deactivation ends the session's power immediately (BR-07), so the
// write path answers 401 rather than Lab 2's "requester not found" 404.
describe('POST /api/tickets — inactive requester', () => {
  it('returns 401 once the signed-in requester is deactivated', async () => {
    const soonInactive = await createLoggedInUser({ role: 'REQUESTER' })
    await prisma.user.update({ where: { id: soonInactive.user.id }, data: { isActive: false } })

    const res = await soonInactive.agent.post('/api/tickets').send(await validPayload())

    expect(res.status).toBe(401)
    expect(await prisma.ticket.count({ where: { requesterId: soonInactive.user.id } })).toBe(0)
  })
})
