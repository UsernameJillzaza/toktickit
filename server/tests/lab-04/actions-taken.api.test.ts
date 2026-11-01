import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser, createTestUser } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'
import { createTicketAs, insertTicket } from '../helpers/tickets'

let requester: { user: TestUser; agent: TestAgent }
let staff: { user: TestUser; agent: TestAgent }
let otherStaff: { user: TestUser; agent: TestAgent }
let admin: { user: TestUser; agent: TestAgent }
let inactiveStaff: TestUser

beforeAll(async () => {
  requester = await createLoggedInUser({ role: 'REQUESTER' })
  staff = await createLoggedInUser({ role: 'IT_STAFF' })
  otherStaff = await createLoggedInUser({ role: 'IT_STAFF' })
  admin = await createLoggedInUser({ role: 'ADMIN' })
  inactiveStaff = await createTestUser({ role: 'IT_STAFF', isActive: false })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

let keyCounter = 0
const key = () => `t-${Date.now()}-${++keyCounter}`
const base = (extra: Record<string, unknown> = {}) => ({ requestKey: key(), description: 'Replaced the HDMI switcher', ...extra })
const actionsUrl = (ticketId: number) => `/api/staff/tickets/${ticketId}/actions`
const create = (agent: TestAgent, ticketId: number, body: Record<string, unknown> = base()) => agent.post(actionsUrl(ticketId)).send(body)
const newTicket = async () => (await createTicketAs(requester.agent, 'Projector shows no signal')).id
const count = (ticketId: number) => prisma.actionTaken.count({ where: { ticketId } })
const updatedAt = async (ticketId: number) => (await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).updatedAt.getTime()
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms))

// API-01 (FR-01, AC-01)
describe('API-01 create a valid Action', () => {
  it('saves it under the Ticket with the signed-in user as creator and performer, Open, version 1', async () => {
    const ticketId = await newTicket()
    const res = await create(staff.agent, ticketId, base({ description: '  Replaced the HDMI switcher  ', attachmentNotes: 'Photo in folder 401' }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      ticketId,
      description: 'Replaced the HDMI switcher',
      result: null,
      status: 'OPEN',
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: 'Photo in folder 401',
      version: 1,
      performedBy: { id: staff.user.id, name: staff.user.name, role: 'IT_STAFF' },
      createdBy: { id: staff.user.id, name: staff.user.name },
    })
    expect(new Date(res.body.actionAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(JSON.stringify(res.body)).not.toContain('@') // no e-mail addresses in the object
    expect(await count(ticketId)).toBe(1)
  })

  it('an Administrator may create one too, and the Ticket owner is not required (BR-02)', async () => {
    const ticketId = await newTicket() // no owner at all
    const res = await create(admin.agent, ticketId)
    expect(res.status).toBe(201)
    expect(res.body.performedBy.role).toBe('ADMIN')
  })

  it('the client cannot choose the creator, status or version', async () => {
    const ticketId = await newTicket()
    for (const field of ['createdById', 'status', 'version', 'id']) {
      const res = await create(staff.agent, ticketId, base({ [field]: field === 'status' ? 'COMPLETED' : 99 }))
      expect(res.status, field).toBe(400)
      expect(res.body.field).toBe(field)
    }
    expect(await count(ticketId)).toBe(0)
  })
})

// API-02 (BR-16, AC-02)
describe('API-02 the same requestKey twice', () => {
  it('returns the first Action with 200 and creates nothing new, whatever the second body says', async () => {
    const ticketId = await newTicket()
    const requestKey = key()
    const first = await create(staff.agent, ticketId, { requestKey, description: 'First attempt' })
    const second = await create(staff.agent, ticketId, { requestKey, description: 'A different text on retry', followUpRequired: true, followUpNote: 'x' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.id).toBe(first.body.id)
    expect(second.body.description).toBe('First attempt')
    expect(await count(ticketId)).toBe(1)
  })

  it('a repeat must still have the shape of a create: an unknown field is a 400 even then', async () => {
    const ticketId = await newTicket()
    const requestKey = key()
    const first = await create(staff.agent, ticketId, { requestKey, description: 'Original' })
    const repeat = await create(staff.agent, ticketId, { requestKey, description: 'Original', status: 'COMPLETED' })
    expect(repeat.status).toBe(400)
    expect(repeat.body.field).toBe('status')
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: first.body.id } })
    expect(row).toMatchObject({ status: 'OPEN', description: 'Original', version: 1 })
  })

  it('the same key on another Ticket is a different Action', async () => {
    const [a, b] = [await newTicket(), await newTicket()]
    const requestKey = key()
    expect((await create(staff.agent, a, { requestKey, description: 'On A' })).status).toBe(201)
    expect((await create(staff.agent, b, { requestKey, description: 'On B' })).status).toBe(201)
  })

  it('a replay still answers after the Ticket stopped being workable', async () => {
    const ticketId = await newTicket()
    const requestKey = key()
    const first = await create(staff.agent, ticketId, { requestKey, description: 'Before it was resolved' })
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: 'CLOSED' } })
    const replay = await create(staff.agent, ticketId, { requestKey, description: 'Before it was resolved' })
    expect(replay.status).toBe(200)
    expect(replay.body.id).toBe(first.body.id)
  })
})

// API-03 (BR-04 … BR-07, AC-03)
describe('API-03 invalid fields', () => {
  const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['empty description', { description: '' }, 'description'],
    ['blank description', { description: '   ' }, 'description'],
    ['description over 2000', { description: 'x'.repeat(2001) }, 'description'],
    ['description not text', { description: 42 }, 'description'],
    ['follow-up required without a note', { followUpRequired: true }, 'followUpNote'],
    ['follow-up required with a blank note', { followUpRequired: true, followUpNote: '  ' }, 'followUpNote'],
    ['a note without follow-up required', { followUpNote: 'Check again' }, 'followUpNote'],
    ['follow-up note over 1000', { followUpRequired: true, followUpNote: 'x'.repeat(1001) }, 'followUpNote'],
    ['follow-up required not a boolean', { followUpRequired: 'yes', followUpNote: 'x' }, 'followUpRequired'],
    ['attachment notes over 500', { attachmentNotes: 'x'.repeat(501) }, 'attachmentNotes'],
    ['actionAt more than 5 minutes ahead', { actionAt: future() }, 'actionAt'],
    ['actionAt not a date', { actionAt: 'yesterday-ish' }, 'actionAt'],
    ['performedById not a whole number', { performedById: 'abc' }, 'performedById'],
  ]

  it.each(cases)('%s → 400 naming the field, nothing saved', async (_label, extra, field) => {
    const ticketId = await newTicket()
    const res = await create(staff.agent, ticketId, base(extra))
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field })
    expect(await count(ticketId)).toBe(0)
  })

  it('input-shape errors come first: no requestKey, a bad key, a non-object body, an unknown field', async () => {
    const ticketId = await newTicket()
    const noKey = await staff.agent.post(actionsUrl(ticketId)).send({ description: 'x' })
    expect(noKey.status).toBe(400)
    expect(noKey.body.field).toBe('requestKey')
    expect((await create(staff.agent, ticketId, base({ requestKey: 'k'.repeat(65) }))).body.field).toBe('requestKey')
    expect((await staff.agent.post(actionsUrl(ticketId)).send([1, 2])).body.field).toBe('body')
    expect((await create(staff.agent, ticketId, base({ nonsense: 1 }))).body.field).toBe('nonsense')
    // …and they win over the lookup: a missing Ticket with a bad body is still a 400, as api-spec says
    expect((await create(staff.agent, 999999999, base({ nonsense: 1 }))).status).toBe(400)
    expect(await count(ticketId)).toBe(0)
  })

  it('the limits themselves are accepted', async () => {
    const ticketId = await newTicket()
    const res = await create(staff.agent, ticketId, base({
      description: 'x'.repeat(2000), attachmentNotes: 'y'.repeat(500), followUpRequired: true, followUpNote: 'z'.repeat(1000),
      actionAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(), // inside the 5-minute tolerance
    }))
    expect(res.status).toBe(201)
  })

  it('a Ticket that does not exist is 404 once the body is well-formed', async () => {
    expect((await create(staff.agent, 999999999)).status).toBe(404)
    expect((await create(staff.agent, 0)).status).toBe(404)
    expect((await staff.agent.get(actionsUrl(999999999))).status).toBe(404)
  })
})

// API-04 (BR-02, BR-03, AC-04)
describe('API-04 performer rules', () => {
  it('rejects an inactive IT Staff member, a Requester and an unknown user with PERFORMER_INVALID', async () => {
    const ticketId = await newTicket()
    for (const performedById of [inactiveStaff.id, requester.user.id, 999999999]) {
      const res = await create(staff.agent, ticketId, base({ performedById }))
      expect(res.status, String(performedById)).toBe(400)
      expect(res.body).toMatchObject({ code: 'PERFORMER_INVALID', field: 'performedById' })
    }
    expect(await count(ticketId)).toBe(0)
  })

  it('accepts another active IT Staff member or an Administrator, recording who created it', async () => {
    const ticketId = await newTicket()
    const toStaff = await create(staff.agent, ticketId, base({ performedById: otherStaff.user.id }))
    expect(toStaff.status).toBe(201)
    expect(toStaff.body.performedBy.id).toBe(otherStaff.user.id)
    expect(toStaff.body.createdBy.id).toBe(staff.user.id)
    const toAdmin = await create(staff.agent, ticketId, base({ performedById: admin.user.id }))
    expect(toAdmin.status).toBe(201)
    expect(toAdmin.body.performedBy.role).toBe('ADMIN')
  })

  it('the same rule applies when the performer of an Open Action is changed', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    const bad = await staff.agent.patch(`${actionsUrl(ticketId)}/${a.id}`).send({ version: 1, performedById: inactiveStaff.id })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('PERFORMER_INVALID')
    const good = await staff.agent.patch(`${actionsUrl(ticketId)}/${a.id}`).send({ version: 1, performedById: otherStaff.user.id })
    expect(good.status).toBe(200)
    expect(good.body.performedBy.id).toBe(otherStaff.user.id)
  })
})

const edit = (agent: TestAgent, ticketId: number, id: number, body: Record<string, unknown>) =>
  agent.patch(`${actionsUrl(ticketId)}/${id}`).send(body)
const complete = (agent: TestAgent, ticketId: number, id: number, body: Record<string, unknown>) =>
  agent.post(`${actionsUrl(ticketId)}/${id}/complete`).send(body)
const cancel = (agent: TestAgent, ticketId: number, id: number, body: Record<string, unknown>) =>
  agent.post(`${actionsUrl(ticketId)}/${id}/cancel`).send(body)

// API-05 (FR-03, FR-06, AC-05)
describe('API-05 edit an Open Action', () => {
  it('changes the fields, raises version by 1 and keeps the creator', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    const res = await edit(otherStaff.agent, ticketId, a.id, {
      version: 1,
      description: '  Replaced the cable instead  ',
      performedById: otherStaff.user.id,
      followUpRequired: true,
      followUpNote: 'Check the picture on Monday',
      attachmentNotes: 'Photo of the cable',
      result: 'Draft: picture is back',
      actionAt: '2026-10-30T08:00:00.000Z',
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      version: 2, status: 'OPEN', description: 'Replaced the cable instead', followUpRequired: true,
      followUpNote: 'Check the picture on Monday', attachmentNotes: 'Photo of the cable', result: 'Draft: picture is back',
      performedBy: { id: otherStaff.user.id }, createdBy: { id: staff.user.id },
    })
    expect(res.body.actionAt).toBe('2026-10-30T08:00:00.000Z')
  })

  it('fields that are not sent stay as they were; unticking follow-up clears its note', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId, base({ followUpRequired: true, followUpNote: 'Look again', attachmentNotes: 'keep me' }))).body
    const res = await edit(staff.agent, ticketId, a.id, { version: 1, followUpRequired: false })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ followUpRequired: false, followUpNote: null, attachmentNotes: 'keep me', description: a.description })
  })

  it('applies the field rules to the merged result and sends nothing for unknown fields', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    const noNote = await edit(staff.agent, ticketId, a.id, { version: 1, followUpRequired: true })
    expect(noNote.status).toBe(400)
    expect(noNote.body.field).toBe('followUpNote')
    expect((await edit(staff.agent, ticketId, a.id, { version: 1, description: '' })).body.field).toBe('description')
    expect((await edit(staff.agent, ticketId, a.id, { version: 1, status: 'COMPLETED' })).body.field).toBe('status')
    expect((await edit(staff.agent, ticketId, a.id, { description: 'no version' })).body.field).toBe('version')
    const after = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })
    expect(after.version).toBe(1) // nothing above changed anything
  })

  it('an Action of another Ticket, or a missing one, is 404', async () => {
    const [t1, t2] = [await newTicket(), await newTicket()]
    const a = (await create(staff.agent, t1)).body
    expect((await edit(staff.agent, t2, a.id, { version: 1, description: 'x' })).status).toBe(404)
    expect((await edit(staff.agent, t1, 999999999, { version: 1, description: 'x' })).status).toBe(404)
    expect((await edit(staff.agent, t1, 0, { version: 1, description: 'x' })).status).toBe(404)
  })
})

// API-06 (BR-15, AC-06)
describe('API-06 stale versions', () => {
  it('edit, complete and cancel with an old version are refused and change nothing', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    expect((await edit(staff.agent, ticketId, a.id, { version: 1, description: 'Second user got there first' })).status).toBe(200) // → version 2
    for (const [label, res] of [
      ['edit', await edit(otherStaff.agent, ticketId, a.id, { version: 1, description: 'Overwrite?' })],
      ['complete', await complete(otherStaff.agent, ticketId, a.id, { version: 1, result: 'Done' })],
      ['cancel', await cancel(otherStaff.agent, ticketId, a.id, { version: 1, result: 'No longer needed' })],
    ] as const) {
      expect(res.status, label).toBe(409)
      expect(res.body.code, label).toBe('STALE_UPDATE')
    }
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })
    expect(row).toMatchObject({ description: 'Second user got there first', status: 'OPEN', version: 2 })
  })
})

// API-06 (BR-15), the claim that matters: two people editing at the same moment
// must not overwrite each other. The overlap is forced as in API-13.
describe('API-06 two edits with the same version at the same moment', () => {
  it('exactly one wins; the other gets STALE_UPDATE and its text is not saved', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    let pending!: Promise<Array<{ status: number; body: { code?: string } }>>
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`
        pending = Promise.all([
          edit(staff.agent, ticketId, a.id, { version: 1, description: 'Edit from the first person' }),
          edit(otherStaff.agent, ticketId, a.id, { version: 1, description: 'Edit from the second person' }),
        ])
        const deadline = Date.now() + 8000
        for (;;) {
          const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query LIKE '%"Ticket"%FOR UPDATE%'`
          if (n >= 2) break
          if (Date.now() > deadline) throw new Error('the two edits never queued on the Ticket lock')
          await new Promise((r) => setTimeout(r, 20))
        }
      },
      { timeout: 15000 },
    )
    const results = await pending
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(results.find((r) => r.status === 409)!.body.code).toBe('STALE_UPDATE')
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })
    expect(row.version).toBe(2) // one change, not two
    expect(['Edit from the first person', 'Edit from the second person']).toContain(row.description)
  })
})

// API-07 (FR-04, AC-07)
describe('API-07 complete', () => {
  it('needs a result; with one the Action is Completed and version rises', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    const noResult = await complete(staff.agent, ticketId, a.id, { version: 1 })
    expect(noResult.status).toBe(400)
    expect(noResult.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'result' })
    expect((await complete(staff.agent, ticketId, a.id, { version: 1, result: '   ' })).status).toBe(400)
    expect((await complete(staff.agent, ticketId, a.id, { version: 1, result: 'x'.repeat(2001) })).status).toBe(400)
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('OPEN')

    const ok = await complete(otherStaff.agent, ticketId, a.id, { version: 1, result: '  Picture is back  ' })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ status: 'COMPLETED', result: 'Picture is back', version: 2 })
  })

  it('shape errors: no version, an unknown field', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    expect((await complete(staff.agent, ticketId, a.id, { result: 'Done' })).body.field).toBe('version')
    expect((await complete(staff.agent, ticketId, a.id, { version: 1, result: 'Done', description: 'sneaky' })).body.field).toBe('description')
  })
})

// API-08 (FR-05, AC-08)
describe('API-08 cancel', () => {
  it('needs a reason; with one the Action is Cancelled and the reason is kept in result', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    const noReason = await cancel(staff.agent, ticketId, a.id, { version: 1 })
    expect(noReason.status).toBe(400)
    expect(noReason.body.field).toBe('result')
    const ok = await cancel(staff.agent, ticketId, a.id, { version: 1, result: 'The switcher turned out to be fine' })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ status: 'CANCELLED', result: 'The switcher turned out to be fine', version: 2 })
  })
})

// API-09 (BR-10, AC-09)
describe('API-09 final Actions and no delete', () => {
  it('a Completed or Cancelled Action cannot be edited, completed or cancelled again', async () => {
    const ticketId = await newTicket()
    const done = (await create(staff.agent, ticketId)).body
    const gone = (await create(staff.agent, ticketId)).body
    await complete(staff.agent, ticketId, done.id, { version: 1, result: 'Done' })
    await cancel(staff.agent, ticketId, gone.id, { version: 1, result: 'Not needed' })
    for (const [id, version] of [[done.id, 2], [gone.id, 2]] as const) {
      for (const res of [
        await edit(staff.agent, ticketId, id, { version, description: 'Changed my mind' }),
        await complete(staff.agent, ticketId, id, { version, result: 'Again' }),
        await cancel(staff.agent, ticketId, id, { version, result: 'Again' }),
      ]) {
        expect(res.status).toBe(409)
        expect(res.body.code).toBe('ACTION_FINAL')
      }
    }
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: done.id } })).description).toBe(done.description)
  })

  it('there is no delete: DELETE answers 404 like any unknown route, and the row survives', async () => {
    const ticketId = await newTicket()
    const a = (await create(staff.agent, ticketId)).body
    for (const agent of [staff.agent, admin.agent]) {
      const res = await agent.delete(`${actionsUrl(ticketId)}/${a.id}`)
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    }
    expect(await count(ticketId)).toBe(1)
  })
})

// API-10 (BR-11, AC-10)
describe('API-10 Tickets that are not workable', () => {
  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'] as const)('%s: create, edit, complete and cancel are all refused', async (status) => {
    const ticket = await insertTicket({ requesterId: requester.user.id, summary: `A ${status} ticket`, status, ownerId: staff.user.id })
    const open = await prisma.actionTaken.create({
      data: { ticketId: ticket.id, actionAt: new Date(), description: 'Left open by a test', performedById: staff.user.id, createdById: staff.user.id },
    })
    const results = [
      await create(staff.agent, ticket.id),
      await edit(staff.agent, ticket.id, open.id, { version: 1, description: 'x' }),
      await complete(staff.agent, ticket.id, open.id, { version: 1, result: 'x' }),
      await cancel(staff.agent, ticket.id, open.id, { version: 1, result: 'x' }),
    ]
    for (const res of results) {
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('TICKET_NOT_WORKABLE')
    }
    expect(await count(ticket.id)).toBe(1)
  })

  it.each(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const)('%s is workable', async (status) => {
    const ticket = await insertTicket({ requesterId: requester.user.id, summary: `A ${status} ticket`, status, ownerId: staff.user.id })
    expect((await create(staff.agent, ticket.id)).status).toBe(201)
  })

  it('the list says whether the Ticket is workable', async () => {
    const ticket = await insertTicket({ requesterId: requester.user.id, summary: 'Resolved, for the flag', status: 'RESOLVED', ownerId: staff.user.id })
    const res = await staff.agent.get(actionsUrl(ticket.id))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ticketStatus: 'RESOLVED', workable: false, actions: [] })
  })
})

// API-11 (BR-12, AC-11)
describe('API-11 list order', () => {
  it('lists by actionAt then id, with performer names, the same every time', async () => {
    const ticketId = await newTicket()
    const t = (iso: string) => ({ actionAt: iso })
    const late = (await create(staff.agent, ticketId, base({ description: 'Third in time', ...t('2026-10-30T12:00:00.000Z') }))).body
    const early = (await create(otherStaff.agent, ticketId, base({ description: 'First in time', performedById: admin.user.id, ...t('2026-10-30T08:00:00.000Z') }))).body
    const tieA = (await create(staff.agent, ticketId, base({ description: 'Tie, created first', ...t('2026-10-30T10:00:00.000Z') }))).body
    const tieB = (await create(staff.agent, ticketId, base({ description: 'Tie, created second', ...t('2026-10-30T10:00:00.000Z') }))).body

    const first = await staff.agent.get(actionsUrl(ticketId))
    const second = await staff.agent.get(actionsUrl(ticketId))
    expect(first.status).toBe(200)
    expect(first.body.actions.map((a: { id: number }) => a.id)).toEqual([early.id, tieA.id, tieB.id, late.id])
    expect(second.body).toEqual(first.body)
    expect(first.body.actions[0].performedBy).toMatchObject({ id: admin.user.id, name: admin.user.name, role: 'ADMIN' })
    expect(first.body.actions[0].createdBy.id).toBe(otherStaff.user.id)
    expect(first.body).toMatchObject({ workable: true, ticketStatus: 'NEW' })
  })
})

// API-12 (BR-21, AC-12)
describe('API-12 a Ticket with no Actions', () => {
  it('lists an empty array and the Ticket keeps working', async () => {
    const ticketId = await newTicket()
    const res = await staff.agent.get(actionsUrl(ticketId))
    expect(res.status).toBe(200)
    expect(res.body.actions).toEqual([])
    const detail = await staff.agent.get(`/api/staff/tickets/${ticketId}`)
    expect(detail.status).toBe(200)
  })
})

// API-13 (BR-16, AC-02, AC-35)
//
// Fired "together", the second request can arrive after the first has already
// finished and simply find its Action (a 200) — safe, but it never meets the
// race. So the test holds the Ticket row lock itself, waits until BOTH
// requests are queued behind it, then releases them: the overlap is forced.
// If the route did not lock the Ticket, nothing would ever queue and this
// test would fail on its deadline instead of passing by luck.
describe('API-13 two creates at the same moment with one requestKey', () => {
  it('leave exactly one row: one 201 and one 200', async () => {
    const ticketId = await newTicket()
    const body = base({ description: 'Double click' })
    let pending!: Promise<Array<{ status: number; body: { id: number } }>>
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`
        pending = Promise.all([create(staff.agent, ticketId, body), create(otherStaff.agent, ticketId, body)])
        const deadline = Date.now() + 8000
        for (;;) {
          const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query LIKE '%"Ticket"%FOR UPDATE%'`
          if (n >= 2) break
          if (Date.now() > deadline) throw new Error('the two creates never queued on the Ticket lock')
          await new Promise((r) => setTimeout(r, 20))
        }
        // The lock is released when this transaction ends, with both waiting.
      },
      { timeout: 15000 },
    )
    const [a, b] = await pending
    expect([a.status, b.status].sort()).toEqual([200, 201])
    expect(a.body.id).toBe(b.body.id)
    expect(await count(ticketId)).toBe(1)
  })
})

// API-14 (BR-17, AC-01)
describe('API-14 every successful change moves the Ticket’s Last Updated', () => {
  it('create, edit, complete and cancel each increase updatedAt; a refused change does not', async () => {
    const ticketId = await newTicket()
    let last = await updatedAt(ticketId)
    await wait()
    const a = (await create(staff.agent, ticketId)).body
    const afterCreate = await updatedAt(ticketId)
    expect(afterCreate).toBeGreaterThan(last)
    last = afterCreate
    await wait()
    await edit(staff.agent, ticketId, a.id, { version: 1, description: 'Edited' })
    const afterEdit = await updatedAt(ticketId)
    expect(afterEdit).toBeGreaterThan(last)
    last = afterEdit
    await wait()
    await edit(staff.agent, ticketId, a.id, { version: 1, description: 'Stale, refused' })
    expect(await updatedAt(ticketId)).toBe(last)
    await complete(staff.agent, ticketId, a.id, { version: 2, result: 'Done' })
    const afterComplete = await updatedAt(ticketId)
    expect(afterComplete).toBeGreaterThan(last)
    last = afterComplete
    await wait()
    const b = (await create(staff.agent, ticketId)).body
    await wait()
    last = await updatedAt(ticketId)
    await cancel(staff.agent, ticketId, b.id, { version: 1, result: 'Not needed' })
    expect(await updatedAt(ticketId)).toBeGreaterThan(last)
  })
})
