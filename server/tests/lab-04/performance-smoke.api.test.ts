import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { insertTicket } from '../helpers/tickets'

// PERF-01 (D-14, AC-25, AC-27): a smoke guard against an accidental N+1 query,
// not a benchmark. The median of five calls keeps one slow call on a busy
// machine from failing the run.

const CALLS = 5
const LIMIT_MS = 1500

let requester: { user: TestUser; agent: TestAgent }
let staff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
  // The Requester has a realistic pile of Tickets on top of whatever the seed holds.
  for (let i = 0; i < 40; i++) {
    await insertTicket({ requesterId: requester.user.id, summary: `Perf fixture ${i}`, status: i % 3 ? 'OPEN' : 'WAITING_FOR_REQUESTER', itPriority: 'MEDIUM' })
  }
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

async function medianMs(call: () => Promise<{ status: number }>): Promise<number> {
  const times: number[] = []
  for (let i = 0; i < CALLS; i++) {
    const start = performance.now()
    const res = await call()
    times.push(performance.now() - start)
    expect(res.status).toBe(200)
  }
  return times.sort((a, b) => a - b)[Math.floor(CALLS / 2)]
}

describe('PERF-01 the dashboards and the Actions list answer in time on the seeded data', () => {
  it('Requester dashboard', async () => {
    expect(await medianMs(() => requester.agent.get('/api/dashboard/requester'))).toBeLessThan(LIMIT_MS)
  })

  it('IT Staff dashboard', async () => {
    expect(await medianMs(() => staff.agent.get('/api/dashboard/staff'))).toBeLessThan(LIMIT_MS)
  })

  it('Administrator dashboard (with the users card)', async () => {
    expect(await medianMs(() => admin.agent.get('/api/dashboard/staff'))).toBeLessThan(LIMIT_MS)
  })

  it('the Actions list of the Ticket that has the most Actions', async () => {
    const busiest = await prisma.actionTaken.groupBy({ by: ['ticketId'], _count: { _all: true }, orderBy: { _count: { ticketId: 'desc' } }, take: 1 })
    // The seed holds Actions (MIG-03); an unseeded database must fail here, not pass without measuring.
    expect(busiest.length, 'run the seed first: no Action exists to measure').toBeGreaterThan(0)
    const id = busiest[0].ticketId
    expect(await medianMs(() => staff.agent.get(`/api/staff/tickets/${id}/actions`))).toBeLessThan(LIMIT_MS)
  })
})
