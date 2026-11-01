import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { insertTicket } from '../helpers/tickets'
import { ALL_STATUSES, allowedTransitions } from '../../src/tickets/workflow'
import type { TicketStatus } from '../../src/generated/prisma/client'

let requester: { user: TestUser; agent: TestAgent }
let staff: { user: TestUser; agent: TestAgent }
let otherStaff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  otherStaff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

type ActionState = 'OPEN' | 'COMPLETED' | 'CANCELLED'

/** A Ticket in `status` (owned unless `owned: false`) with the given Actions already on it. */
async function ticketWith(status: TicketStatus, actions: ActionState[] = [], owned = true) {
  const t = await insertTicket({ requesterId: requester.user.id, summary: `Workflow fixture ${status}`, status, ownerId: owned ? staff.user.id : null })
  for (const [i, s] of actions.entries()) {
    await prisma.actionTaken.create({
      data: {
        ticketId: t.id, actionAt: new Date(), description: `Fixture action ${i + 1}`, status: s,
        result: s === 'OPEN' ? null : 'Done for the fixture', performedById: staff.user.id, createdById: staff.user.id,
      },
    })
  }
  return t
}

const stamp = async (id: number) => (await prisma.ticket.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString()
const statusOf = async (id: number) => (await prisma.ticket.findUniqueOrThrow({ where: { id } })).currentStatus
/** PUT status with the current updatedAt, i.e. "from a screen that is up to date". */
const setStatus = async (agent: TestAgent, id: number, status: unknown) =>
  agent.put(`/api/staff/tickets/${id}/status`).send({ status, expectedUpdatedAt: await stamp(id) })
const setStatusWith = (agent: TestAgent, id: number, body: Record<string, unknown>) =>
  agent.put(`/api/staff/tickets/${id}/status`).send(body)
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms))

// API-20 (BR-19, AC-17)
describe('API-20 resolve when the gate is satisfied', () => {
  it.each(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const)('a %s Ticket with one Completed and no Open Action becomes RESOLVED', async (from) => {
    const t = await ticketWith(from, ['COMPLETED'])
    const res = await setStatus(staff.agent, t.id, 'RESOLVED')
    expect(res.status).toBe(200)
    expect(res.body.currentStatus).toBe('RESOLVED')
    expect(await statusOf(t.id)).toBe('RESOLVED')
  })

  it('cancelled Actions do not get in the way, and several Completed ones are fine', async () => {
    const t = await ticketWith('IN_PROGRESS', ['COMPLETED', 'CANCELLED', 'COMPLETED', 'CANCELLED'])
    expect((await setStatus(admin.agent, t.id, 'RESOLVED')).status).toBe(200)
  })
})

// API-21 (BR-19, AC-18): the only path is a direct call; there is no other.
describe('API-21 resolve while the gate is not satisfied', () => {
  it.each<[string, ActionState[], string[]]>([
    ['no Actions at all', [], ['NO_COMPLETED_ACTION']],
    ['only cancelled Actions', ['CANCELLED', 'CANCELLED'], ['NO_COMPLETED_ACTION']],
    ['an Open Action and nothing completed', ['OPEN'], ['NO_COMPLETED_ACTION', 'OPEN_ACTIONS']],
    ['a Completed Action but another still Open', ['COMPLETED', 'OPEN'], ['OPEN_ACTIONS']],
  ])('%s → 409 RESOLUTION_BLOCKED with the reasons, status unchanged', async (_label, actions, reasons) => {
    const t = await ticketWith('IN_PROGRESS', actions)
    const res = await setStatus(staff.agent, t.id, 'RESOLVED')
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'RESOLUTION_BLOCKED', reasons })
    expect(res.body.error).toMatch(/cannot be resolved yet/i)
    expect(await statusOf(t.id)).toBe('IN_PROGRESS')
  })

  it('blocks every source status that can reach RESOLVED', async () => {
    for (const from of ['OPEN', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const) {
      const t = await ticketWith(from, ['OPEN'])
      const res = await setStatus(staff.agent, t.id, 'RESOLVED')
      expect(res.status, from).toBe(409)
      expect(res.body.code, from).toBe('RESOLUTION_BLOCKED')
    }
  })

  it('an Administrator is held to the same gate', async () => {
    const t = await ticketWith('IN_PROGRESS', [])
    expect((await setStatus(admin.agent, t.id, 'RESOLVED')).body.code).toBe('RESOLUTION_BLOCKED')
  })

  it('stops blocking the moment the work is finished', async () => {
    const t = await ticketWith('IN_PROGRESS', ['OPEN'])
    expect((await setStatus(staff.agent, t.id, 'RESOLVED')).status).toBe(409)
    const open = await prisma.actionTaken.findFirstOrThrow({ where: { ticketId: t.id } })
    const done = await staff.agent.post(`/api/staff/tickets/${t.id}/actions/${open.id}/complete`).send({ version: open.version, result: 'Fixed' })
    expect(done.status).toBe(200)
    expect((await setStatus(staff.agent, t.id, 'RESOLVED')).status).toBe(200)
  })
})

// API-22 (BR-20, AC-19)
describe('API-22 cancel', () => {
  it('is blocked by an Open Action, allowed without one', async () => {
    const blocked = await ticketWith('OPEN', ['COMPLETED', 'OPEN'])
    const res = await setStatus(staff.agent, blocked.id, 'CANCELLED')
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'RESOLUTION_BLOCKED', reasons: ['OPEN_ACTIONS'] })
    expect(res.body.error).toMatch(/cannot be cancelled yet/i)
    expect(await statusOf(blocked.id)).toBe('OPEN')

    for (const actions of [[], ['COMPLETED'], ['CANCELLED'], ['COMPLETED', 'CANCELLED']] as ActionState[][]) {
      const t = await ticketWith('NEW', actions, false)
      const ok = await setStatus(staff.agent, t.id, 'CANCELLED')
      expect(ok.status, actions.join(',') || 'none').toBe(200)
      expect(ok.body.currentStatus).toBe('CANCELLED')
    }
  })
})

// API-23 (BR-22, AC-20)
describe('API-23 "Problem Appears Resolved" is only advice', () => {
  it('the Requester pressing it changes no status, and the gate still applies', async () => {
    const t = await ticketWith('IN_PROGRESS', ['OPEN'])
    const pressed = await requester.agent.post(`/api/tickets/${t.id}/resolved-indication`)
    expect(pressed.status).toBe(200)
    expect(await statusOf(t.id)).toBe('IN_PROGRESS')
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).requesterResolvedAt).not.toBeNull()
    const res = await setStatus(staff.agent, t.id, 'RESOLVED')
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('RESOLUTION_BLOCKED')
  })

  it('a Requester cannot change a status at all', async () => {
    const t = await ticketWith('IN_PROGRESS', ['COMPLETED'])
    const res = await requester.agent.put(`/api/staff/tickets/${t.id}/status`).send({ status: 'RESOLVED', expectedUpdatedAt: await stamp(t.id) })
    expect(res.status).toBe(403)
    expect(await statusOf(t.id)).toBe('IN_PROGRESS')
  })
})

// API-24 (BR-18, AC-21)
describe('API-24 the matrix is unchanged and the order of checks holds', () => {
  it('allowedTransitions in the staff detail equals the matrix for every status', async () => {
    for (const status of ALL_STATUSES) {
      const t = await ticketWith(status, [])
      const res = await staff.agent.get(`/api/staff/tickets/${t.id}`)
      expect(res.body.allowedTransitions, status).toEqual(allowedTransitions(status))
    }
  })

  it('moves outside the matrix are INVALID_TRANSITION, including to the same status and out of a terminal one', async () => {
    const cases: Array<[TicketStatus, TicketStatus]> = [['NEW', 'RESOLVED'], ['RESOLVED', 'IN_PROGRESS'], ['CLOSED', 'REOPENED'], ['CANCELLED', 'OPEN'], ['OPEN', 'OPEN'], ['IN_PROGRESS', 'NEW']]
    for (const [from, to] of cases) {
      const t = await ticketWith(from, ['COMPLETED'])
      const res = await setStatus(staff.agent, t.id, to)
      expect(res.status, `${from}→${to}`).toBe(409)
      expect(res.body.code, `${from}→${to}`).toBe('INVALID_TRANSITION')
    }
  })

  it('the matrix is checked before the gate, and the owner rule before the gate', async () => {
    const noMove = await ticketWith('NEW', []) // NEW → RESOLVED is not in the matrix, and the gate would also fail
    expect((await setStatus(staff.agent, noMove.id, 'RESOLVED')).body.code).toBe('INVALID_TRANSITION')
    const unowned = await ticketWith('OPEN', [], false) // allowed move, but nobody owns it, and the gate would also fail
    expect((await setStatus(staff.agent, unowned.id, 'RESOLVED')).body.code).toBe('OWNER_REQUIRED')
  })
})

// API-25 (BR-23, AC-22)
describe('API-25 expectedUpdatedAt', () => {
  it('is required for a status change: missing, null, empty and malformed are all 400', async () => {
    const t = await ticketWith('OPEN', [])
    for (const body of [{ status: 'IN_PROGRESS' }, { status: 'IN_PROGRESS', expectedUpdatedAt: null }, { status: 'IN_PROGRESS', expectedUpdatedAt: '' }, { status: 'IN_PROGRESS', expectedUpdatedAt: 'last tuesday' }, { status: 'IN_PROGRESS', expectedUpdatedAt: 12345 }]) {
      const res = await setStatusWith(staff.agent, t.id, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'expectedUpdatedAt' })
    }
    expect(await statusOf(t.id)).toBe('OPEN')
  })

  it('an unknown status is still reported on `status`', async () => {
    const t = await ticketWith('OPEN', [])
    const res = await setStatusWith(staff.agent, t.id, { status: 'DONE', expectedUpdatedAt: await stamp(t.id) })
    expect(res.status).toBe(400)
    expect(res.body.field).toBe('status')
  })

  it('an old value is 409 STALE_UPDATE and wins over the matrix; the current value works', async () => {
    const t = await ticketWith('OPEN', [])
    const old = await stamp(t.id)
    await wait()
    expect((await staff.agent.put(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: 'HIGH' })).status).toBe(200)
    const stale = await setStatusWith(otherStaff.agent, t.id, { status: 'IN_PROGRESS', expectedUpdatedAt: old })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('STALE_UPDATE')
    const staleAndInvalid = await setStatusWith(otherStaff.agent, t.id, { status: 'CLOSED', expectedUpdatedAt: old })
    expect(staleAndInvalid.body.code).toBe('STALE_UPDATE') // stale is checked first
    expect(await statusOf(t.id)).toBe('OPEN')
    expect((await setStatus(otherStaff.agent, t.id, 'IN_PROGRESS')).status).toBe(200)
  })

  it('everything that moves Last Updated makes an older screen stale: an Action, a comment, a note, "appears resolved"', async () => {
    const moves: Array<[string, (id: number) => Promise<unknown>]> = [
      ['an Action', (id) => staff.agent.post(`/api/staff/tickets/${id}/actions`).send({ requestKey: `k-${id}`, description: 'New work' })],
      ['a public comment', (id) => requester.agent.post(`/api/tickets/${id}/comments`).send({ body: 'Any news?' })],
      ['an internal note', (id) => staff.agent.post(`/api/staff/tickets/${id}/notes`).send({ body: 'Private remark' })],
      ['the requester’s "appears resolved"', (id) => requester.agent.post(`/api/tickets/${id}/resolved-indication`)],
    ]
    for (const [label, move] of moves) {
      const t = await ticketWith('OPEN', ['COMPLETED'])
      const old = await stamp(t.id)
      await wait()
      const done = (await move(t.id)) as { status: number }
      expect(done.status, label).toBeLessThan(300)
      const res = await setStatusWith(staff.agent, t.id, { status: 'IN_PROGRESS', expectedUpdatedAt: old })
      expect(res.status, label).toBe(409)
      expect(res.body.code, label).toBe('STALE_UPDATE')
    }
  })

  it('is optional on owner and IT priority: absent works as in Lab 3, present must match', async () => {
    const t = await ticketWith('OPEN', [])
    const old = await stamp(t.id)
    expect((await staff.agent.put(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: 'HIGH' })).status).toBe(200) // no field
    const priority = await staff.agent.put(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: 'LOW', expectedUpdatedAt: old })
    expect(priority.status).toBe(409)
    expect(priority.body.code).toBe('STALE_UPDATE')
    const owner = await staff.agent.put(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: otherStaff.user.id, expectedUpdatedAt: old })
    expect(owner.status).toBe(409)
    expect(owner.body.code).toBe('STALE_UPDATE')
    expect((await staff.agent.put(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: otherStaff.user.id, expectedUpdatedAt: await stamp(t.id) })).status).toBe(200)
    const malformed = await staff.agent.put(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: 'LOW', expectedUpdatedAt: 'nope' })
    expect(malformed.status).toBe(400)
    expect(malformed.body.field).toBe('expectedUpdatedAt')
  })

  it('a refused change leaves the Ticket exactly as it was', async () => {
    const t = await ticketWith('IN_PROGRESS', [])
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })
    await setStatus(staff.agent, t.id, 'RESOLVED') // blocked by the gate
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).toEqual(before)
  })
})

// API-26 (BR-21, AC-23)
describe('API-26 Tickets resolved before Lab 4', () => {
  it('a Resolved Ticket with no Actions can still be Closed or Reopened', async () => {
    const toClose = await ticketWith('RESOLVED', [])
    expect((await setStatus(staff.agent, toClose.id, 'CLOSED')).body.currentStatus).toBe('CLOSED')
    const toReopen = await ticketWith('RESOLVED', [])
    await prisma.ticket.update({ where: { id: toReopen.id }, data: { requesterResolvedAt: new Date() } })
    const reopened = await setStatus(staff.agent, toReopen.id, 'REOPENED')
    expect(reopened.status).toBe(200)
    expect(reopened.body).toMatchObject({ currentStatus: 'REOPENED', requesterResolvedAt: null })
  })
})

// API-27 (BR-11, BR-24, D-09 / AC-10, AC-18): the invariant "Resolved means no
// Open Action" must survive a resolve and a create arriving at the same moment.
// As in API-13 the test holds the Ticket lock itself and waits until BOTH
// requests are queued behind it; with the Actions route not locking, only one
// would queue and this test would fail on its deadline.
describe('API-27 resolve and create an Action at the same moment', () => {
  it('never leaves a Resolved Ticket with an Open Action; the loser gets a 409', async () => {
    for (let round = 0; round < 3; round++) {
      const t = await ticketWith('IN_PROGRESS', ['COMPLETED'])
      const expectedUpdatedAt = await stamp(t.id)
      let pending!: Promise<Array<{ status: number; body: { code?: string } }>>
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${t.id} FOR UPDATE`
          pending = Promise.all([
            setStatusWith(staff.agent, t.id, { status: 'RESOLVED', expectedUpdatedAt }),
            staff.agent.post(`/api/staff/tickets/${t.id}/actions`).send({ requestKey: `race-${round}-${t.id}`, description: 'More work found' }),
          ])
          const deadline = Date.now() + 8000
          for (;;) {
            const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE wait_event_type = 'Lock' AND query LIKE '%"Ticket"%FOR UPDATE%'`
            if (n >= 2) break
            if (Date.now() > deadline) throw new Error('the resolve and the create never both queued on the Ticket lock')
            await new Promise((r) => setTimeout(r, 20))
          }
        },
        { timeout: 15000 },
      )
      const [resolve, create] = await pending
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id }, include: { actions: true } })
      const openActions = row.actions.filter((a) => a.status === 'OPEN').length
      expect(row.currentStatus === 'RESOLVED' && openActions > 0, `round ${round}`).toBe(false)
      if (resolve.status === 200) {
        expect(create.status).toBe(409)
        expect(create.body.code).toBe('TICKET_NOT_WORKABLE')
      } else {
        // The Action got in first: the resolve is refused (the Ticket changed under it).
        expect(create.status).toBe(201)
        expect(resolve.status).toBe(409)
        expect(['STALE_UPDATE', 'RESOLUTION_BLOCKED']).toContain(resolve.body.code)
      }
    }
  })
})

// API-28 (FR-08, FR-09 / AC-24)
describe('API-28 the staff detail explains the gate before it is hit', () => {
  it('returns the Action counts and a resolution hint that matches what the status endpoint then does', async () => {
    const t = await ticketWith('IN_PROGRESS', ['COMPLETED', 'COMPLETED', 'OPEN', 'CANCELLED'])
    const detail = await staff.agent.get(`/api/staff/tickets/${t.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.actionCounts).toEqual({ open: 1, completed: 2, cancelled: 1 })
    expect(detail.body.resolution).toEqual({ canResolve: false, canCancel: false, reasons: ['OPEN_ACTIONS'] })
    expect(typeof detail.body.updatedAt).toBe('string')
    expect((await setStatus(staff.agent, t.id, 'RESOLVED')).status).toBe(409)

    const open = await prisma.actionTaken.findFirstOrThrow({ where: { ticketId: t.id, status: 'OPEN' } })
    await staff.agent.post(`/api/staff/tickets/${t.id}/actions/${open.id}/complete`).send({ version: open.version, result: 'Done' })
    const after = await staff.agent.get(`/api/staff/tickets/${t.id}`)
    expect(after.body.actionCounts).toEqual({ open: 0, completed: 3, cancelled: 1 })
    expect(after.body.resolution).toEqual({ canResolve: true, canCancel: true, reasons: [] })
    expect((await setStatus(staff.agent, t.id, 'RESOLVED')).status).toBe(200)
  })

  it('a Ticket with no Actions says why it cannot be resolved, but can be cancelled', async () => {
    const t = await ticketWith('OPEN', [])
    const detail = await staff.agent.get(`/api/staff/tickets/${t.id}`)
    expect(detail.body.actionCounts).toEqual({ open: 0, completed: 0, cancelled: 0 })
    expect(detail.body.resolution).toEqual({ canResolve: false, canCancel: true, reasons: ['NO_COMPLETED_ACTION'] })
  })

  it('every mutation answers with the same detail shape, hints included', async () => {
    const t = await ticketWith('OPEN', ['COMPLETED'])
    const res = await staff.agent.put(`/api/staff/tickets/${t.id}/it-priority`).send({ itPriority: 'HIGH' })
    expect(res.status).toBe(200)
    expect(res.body.actionCounts).toEqual({ open: 0, completed: 1, cancelled: 0 })
    expect(res.body.resolution.canResolve).toBe(true)
  })
})
