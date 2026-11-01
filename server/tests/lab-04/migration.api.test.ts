import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { insertTicket } from '../helpers/tickets'
import { SEED_ACTIONS, seedActions } from '../../prisma/seed-actions'

let staff: { user: TestUser; agent: TestAgent }
let requester: { user: TestUser; agent: TestAgent }

beforeAll(async () => {
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  requester = await createLoggedInUser({ role: 'REQUESTER' })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

const migrationSql = fs.readFileSync(
  path.join(process.cwd(), 'prisma', 'migrations', '20261101130000_add_actions_taken', 'migration.sql'),
  'utf8',
)

// MIG-01 (AC-37). The "drift check is empty" half is a command, not a Vitest
// assertion: `prisma migrate diff … --exit-code`, recorded in tests.md §6.
describe('MIG-01 the Actions Taken migration only adds', () => {
  it('contains nothing but CREATE TYPE / CREATE TABLE / CREATE INDEX and constraints on the new table', () => {
    const statements = migrationSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    expect(statements.length).toBeGreaterThanOrEqual(8)
    for (const s of statements) {
      expect(s, s).toMatch(
        /^(CREATE TYPE "ActionStatus"|CREATE TABLE "ActionTaken"|CREATE (UNIQUE )?INDEX "ActionTaken_[A-Za-z_]+" ON "ActionTaken"|ALTER TABLE "ActionTaken" ADD CONSTRAINT)/,
      )
    }
    // `ON DELETE RESTRICT ON UPDATE CASCADE` is the foreign-key action, not a statement; take it out first.
    const withoutFkActions = migrationSql.replace(/--.*$/gm, '').replace(/ON (DELETE|UPDATE) (RESTRICT|CASCADE|NO ACTION|SET NULL)/gi, '')
    expect(withoutFkActions).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME)\b/i)
  })

  it('the database has the enum, the table, its indexes and the CHECK', async () => {
    const labels = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ActionStatus' ORDER BY e.enumsortorder`
    expect(labels.map((l) => l.enumlabel)).toEqual(['OPEN', 'COMPLETED', 'CANCELLED'])

    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'ActionTaken'`
    expect(columns.map((c) => c.column_name).sort()).toEqual(
      ['actionAt', 'attachmentNotes', 'createdAt', 'createdById', 'description', 'followUpNote', 'followUpRequired', 'id', 'performedById', 'requestKey', 'result', 'status', 'ticketId', 'updatedAt', 'version'].sort(),
    )

    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE tablename = 'ActionTaken'`
    expect(indexes.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        'ActionTaken_pkey',
        'ActionTaken_ticketId_requestKey_key',
        'ActionTaken_ticketId_actionAt_id_idx',
        'ActionTaken_performedById_actionAt_idx',
        'ActionTaken_status_idx',
      ]),
    )
    const checks = await prisma.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = '"ActionTaken"'::regclass`
    expect(checks.map((c) => c.conname)).toContain('ActionTaken_followUp_check')
  })

  it('the data from earlier labs is still there (categories, related systems, the five Lab 2 requesters)', async () => {
    expect(await prisma.category.count()).toBeGreaterThanOrEqual(4)
    expect(await prisma.relatedSystem.count()).toBeGreaterThanOrEqual(7)
    const lab2 = await prisma.user.findMany({
      where: { email: { in: ['jennifer.anderson', 'michael.brown', 'somchai.suksawat', 'nattaya.chaiyaporn', 'david.wilson'].map((n) => `${n}@toktickit.test`) } },
    })
    expect(lab2).toHaveLength(5)
    expect(lab2.every((u) => u.role === 'REQUESTER')).toBe(true)
  })
})

// MIG-02 (BR-06, BR-16, AC-02, AC-03): the database itself holds the line,
// whatever a route forgets.
describe('MIG-02 the database enforces the follow-up rule and the retry key', () => {
  const base = async () => {
    const ticket = await insertTicket({ requesterId: requester.user.id, summary: 'Ticket for constraint tests', status: 'OPEN', ownerId: staff.user.id })
    return {
      ticketId: ticket.id,
      actionAt: new Date(),
      description: 'Constraint test',
      performedById: staff.user.id,
      createdById: staff.user.id,
    }
  }

  it('rejects a follow-up note without follow-up required, accepts the consistent forms', async () => {
    const data = await base()
    await expect(prisma.actionTaken.create({ data: { ...data, followUpRequired: false, followUpNote: 'a note without follow-up' } })).rejects.toThrow(/ActionTaken_followUp_check/)
    await expect(prisma.actionTaken.create({ data: { ...data, followUpRequired: true, followUpNote: 'check again' } })).resolves.toBeTruthy()
    await expect(prisma.actionTaken.create({ data: { ...data, followUpRequired: false, followUpNote: null } })).resolves.toBeTruthy()
  })

  it('rejects a second Action with the same (Ticket, requestKey), allows many without a key, and allows the key on another Ticket', async () => {
    const data = await base()
    await prisma.actionTaken.create({ data: { ...data, requestKey: 'same-key' } })
    await expect(prisma.actionTaken.create({ data: { ...data, requestKey: 'same-key' } })).rejects.toThrow(/Unique constraint|ActionTaken_ticketId_requestKey_key/)
    await prisma.actionTaken.create({ data: { ...data } })
    await prisma.actionTaken.create({ data: { ...data } })
    const other = await base()
    await expect(prisma.actionTaken.create({ data: { ...other, requestKey: 'same-key' } })).resolves.toBeTruthy()
  })

  it('a Ticket that has Actions cannot be deleted (RESTRICT): the record of work is kept', async () => {
    const data = await base()
    await prisma.actionTaken.create({ data })
    await expect(prisma.ticket.delete({ where: { id: data.ticketId } })).rejects.toThrow()
  })
})

// MIG-03 (AC-38, FR-17)
describe('MIG-03 the seed covers every case and can be run again', () => {
  it('running the seed twice leaves the same rows', async () => {
    await seedActions(prisma) // makes sure the first run happened
    const afterFirst = await prisma.actionTaken.count()
    const again = await seedActions(prisma)
    expect(again.created).toBe(0)
    expect(again.skipped).toEqual([]) // a missing Ticket is reported, never silent
    expect(await prisma.actionTaken.count()).toBe(afterFirst)
  })

  it('has every seeded Action in the database, keyed by (Ticket, requestKey)', async () => {
    for (const a of SEED_ACTIONS) {
      const ticket = await prisma.ticket.findFirstOrThrow({ where: { summary: a.ticket }, orderBy: { id: 'asc' } })
      const row = await prisma.actionTaken.findFirst({ where: { ticketId: ticket.id, requestKey: a.key } })
      expect(row, `${a.key} on "${a.ticket}"`).not.toBeNull()
    }
  })

  it('the seed data covers zero, one and several Actions, every status, both follow-up forms and different performers', () => {
    const perTicket = new Map<string, typeof SEED_ACTIONS>()
    for (const a of SEED_ACTIONS) perTicket.set(a.ticket, [...(perTicket.get(a.ticket) ?? []), a])
    const sizes = [...perTicket.values()].map((list) => list.length)
    expect(sizes.some((n) => n === 1)).toBe(true)
    expect(sizes.some((n) => n >= 2)).toBe(true)
    expect(new Set(SEED_ACTIONS.map((a) => a.status))).toEqual(new Set(['OPEN', 'COMPLETED', 'CANCELLED']))
    expect(SEED_ACTIONS.some((a) => a.status === 'COMPLETED' && a.followUp)).toBe(true)
    expect(SEED_ACTIONS.some((a) => a.status === 'COMPLETED' && !a.followUp)).toBe(true)
    expect([...perTicket.values()].some((list) => new Set(list.map((a) => a.by)).size >= 2)).toBe(true)
    expect(SEED_ACTIONS.some((a) => a.by !== a.createdBy)).toBe(true) // recorded by someone else
    const unique = new Set(SEED_ACTIONS.map((a) => `${a.ticket}|${a.key}`))
    expect(unique.size).toBe(SEED_ACTIONS.length)
  })

  it('zero Actions is also covered: most seeded Tickets have none', async () => {
    const withActions = new Set(SEED_ACTIONS.map((a) => a.ticket))
    const seededWithout = await prisma.ticket.count({ where: { summary: { notIn: [...withActions] }, requester: { email: { endsWith: '@toktickit.test' } }, actions: { none: {} } } })
    expect(seededWithout).toBeGreaterThanOrEqual(10)
  })

  it('stays consistent with the gate: a seeded Resolved or Closed Ticket has a Completed Action and no Open one', async () => {
    const finished = await prisma.ticket.findMany({
      where: { summary: { in: [...new Set(SEED_ACTIONS.map((a) => a.ticket))] }, currentStatus: { in: ['RESOLVED', 'CLOSED'] } },
      include: { actions: true },
    })
    expect(finished.length).toBeGreaterThanOrEqual(2)
    for (const t of finished) {
      expect(t.actions.some((a) => a.status === 'COMPLETED'), t.summary).toBe(true)
      expect(t.actions.some((a) => a.status === 'OPEN'), t.summary).toBe(false)
    }
  })

  it('every seeded Open Action is on a Ticket that can still change', async () => {
    const open = await prisma.actionTaken.findMany({ where: { requestKey: { startsWith: 'seed-' }, status: 'OPEN' }, include: { ticket: true } })
    for (const a of open) {
      expect(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'], a.ticket.summary).toContain(a.ticket.currentStatus)
    }
  })
})

// MIG-04 (BR-21, AC-12)
describe('MIG-04 Tickets that existed before the migration', () => {
  it('a seeded Ticket with no Actions lists none and still opens normally', async () => {
    const legacy = await prisma.ticket.findFirstOrThrow({ where: { requester: { email: { endsWith: '@toktickit.test' } }, actions: { none: {} } }, orderBy: { id: 'asc' } })
    const list = await staff.agent.get(`/api/staff/tickets/${legacy.id}/actions`)
    expect(list.status).toBe(200)
    expect(list.body.actions).toEqual([])
    expect((await staff.agent.get(`/api/staff/tickets/${legacy.id}`)).status).toBe(200)
  })

  it('both finished Tickets without Actions are on purpose: one Resolved, one Closed', async () => {
    for (const [summary, status] of [['VPN certificate warning on new laptop', 'RESOLVED'], ['Laptop battery swells and lifts the keyboard', 'CLOSED']] as const) {
      const t = await prisma.ticket.findFirstOrThrow({ where: { summary } })
      expect(t.currentStatus).toBe(status)
      expect(await prisma.actionTaken.count({ where: { ticketId: t.id } })).toBe(0)
      expect(SEED_ACTIONS.some((a) => a.ticket === summary)).toBe(false)
    }
  })

  it('a Resolved Ticket that has no Actions at all is still readable and workable only after reopening', async () => {
    const resolved = await prisma.ticket.findFirstOrThrow({ where: { summary: 'VPN certificate warning on new laptop' } })
    expect(resolved.currentStatus).toBe('RESOLVED')
    expect(await prisma.actionTaken.count({ where: { ticketId: resolved.id } })).toBe(0)
    const list = await staff.agent.get(`/api/staff/tickets/${resolved.id}/actions`)
    expect(list.body).toMatchObject({ ticketStatus: 'RESOLVED', workable: false, actions: [] })
  })
})
