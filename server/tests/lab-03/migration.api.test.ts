import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { verifyPassword } from '../../src/auth/password'
import { SEED_INITIAL_PASSWORD } from '../../prisma/seed-credentials'

// These checks run against the migrated + seeded local database (README
// steps 4–5), because what they prove is that real Lab 2 data survived the
// Lab 3 migrations — test fixtures can't show that.

const LAB2_EMAILS = [
  'jennifer.anderson@toktickit.test',
  'michael.brown@toktickit.test',
  'somchai.suksawat@toktickit.test',
  'nattaya.chaiyaporn@toktickit.test',
  'david.wilson@toktickit.test',
]

afterAll(async () => {
  await prisma.$disconnect()
})

// MIG-01 (AC-11, BR-39)
describe('MIG-01 Development Requesters became Users', () => {
  it('the DevRequester table is gone', async () => {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'DevRequester'`
    expect(rows[0].n).toBe(0)
  })

  it('all five Lab 2 requesters exist as REQUESTER users', async () => {
    const users = await prisma.user.findMany({ where: { email: { in: LAB2_EMAILS } } })
    expect(users).toHaveLength(5)
    expect(users.every((u) => u.role === 'REQUESTER')).toBe(true)
  })

  it('every ticket points at an existing REQUESTER user', async () => {
    const orphans = await prisma.ticket.count({ where: { requester: { role: { not: 'REQUESTER' } } } })
    expect(orphans).toBe(0)
  })
})

// MIG-02 (AC-11, BR-40)
describe('MIG-02 migrated requesters can sign in with the seeded initial password', () => {
  it('signs in and is told to change the password', async (ctx) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: LAB2_EMAILS[0] } })
    // The spec only promises this until the user picks their own password.
    if (!user.passwordHash || !(await verifyPassword(SEED_INITIAL_PASSWORD, user.passwordHash))) {
      ctx.skip('jennifer.anderson already changed the seeded password on this database')
    }

    const agent = request.agent(app)
    const res = await agent.post('/api/auth/login').send({ email: user.email, password: SEED_INITIAL_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user.mustChangePassword).toBe(true)
    await agent.post('/api/auth/logout') // leave no session behind
  })
})

// MIG-03 (BR-21, D-09)
describe('MIG-03 workflow columns are typed and filled', () => {
  it('status and both priorities are Postgres enums, not free text', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string; udt_name: string }[]>`
      SELECT column_name, udt_name FROM information_schema.columns
      WHERE table_name = 'Ticket' AND column_name IN ('currentStatus', 'requestedPriority', 'itPriority')
      ORDER BY column_name`
    expect(cols).toEqual([
      { column_name: 'currentStatus', udt_name: 'TicketStatus' },
      { column_name: 'itPriority', udt_name: 'Priority' },
      { column_name: 'requestedPriority', udt_name: 'Priority' },
    ])
  })

  it('no ticket is missing an IT Priority or Last Updated time', async () => {
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Ticket" WHERE "itPriority" IS NULL OR "updatedAt" IS NULL`
    expect(rows[0].n).toBe(0)
  })

  it('a requester can never have asked for CRITICAL', async () => {
    expect(await prisma.ticket.count({ where: { requestedPriority: 'CRITICAL' } })).toBe(0)
  })
})
