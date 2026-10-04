import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { cleanupTestUsers, createLoggedInUser, createTestUser, loginAgent, TEST_PASSWORD, trackUserForCleanup } from '../helpers/auth'
import type { TestAgent, TestUser } from '../helpers/auth'

const TAG = randomBytes(4).toString('hex')
let admin: { user: TestUser; agent: TestAgent }

beforeAll(async () => {
  admin = await createLoggedInUser({ role: 'ADMIN', name: `Admin ${TAG}` })
})

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

function newUserBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `Created User ${TAG}`,
    email: `created-${randomBytes(4).toString('hex')}@lab3.test`,
    role: 'IT_STAFF',
    isActive: true,
    initialPassword: 'Firstday2026',
    ...overrides,
  }
}

async function createViaApi(overrides: Record<string, unknown> = {}) {
  const res = await admin.agent.post('/api/admin/users').send(newUserBody(overrides))
  if (res.status === 201) trackUserForCleanup(res.body.id)
  return res
}

// API-32 (AC-28)
describe('API-32 list, search and filter', () => {
  it('lists users sorted by name with the contract fields only', async () => {
    const res = await admin.agent.get('/api/admin/users')
    expect(res.status).toBe(200)
    const names: string[] = res.body.map((u: { name: string }) => u.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(Object.keys(res.body[0]).sort()).toEqual(['createdAt', 'email', 'id', 'isActive', 'mustChangePassword', 'name', 'role'])
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('searches name and email ignoring case, and filters by role', async () => {
    const requester = await createTestUser({ role: 'REQUESTER', name: `Searchable Person ${TAG}` })

    const byName = await admin.agent.get('/api/admin/users').query({ search: `searchable person ${TAG}`.toUpperCase() })
    expect(byName.body.map((u: { id: number }) => u.id)).toEqual([requester.id])

    const byEmail = await admin.agent.get('/api/admin/users').query({ search: requester.email.toUpperCase() })
    expect(byEmail.body.map((u: { id: number }) => u.id)).toEqual([requester.id])

    const admins = await admin.agent.get('/api/admin/users').query({ role: 'ADMIN' })
    expect(admins.body.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true)
    expect(admins.body.map((u: { id: number }) => u.id)).toContain(admin.user.id)
  })

  it('rejects an unknown role filter', async () => {
    const res = await admin.agent.get('/api/admin/users').query({ role: 'SUPERUSER' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', field: 'role' })
  })
})

// API-33 (AC-29, BR-33)
describe('API-33 create user', () => {
  it('creates a user who must change the password at first sign-in', async () => {
    const body = newUserBody({ email: `  New.Person-${TAG}@LAB3.test ` })
    const res = await createViaApi(body)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: body.name,
      email: `new.person-${TAG}@lab3.test`,
      role: 'IT_STAFF',
      isActive: true,
      mustChangePassword: true,
    })
    expect(res.body).not.toHaveProperty('passwordHash')

    const agent = await loginAgent({ email: res.body.email, password: 'Firstday2026' })
    const queue = await agent.get('/api/staff/tickets')
    expect(queue.status).toBe(403)
    expect(queue.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })
})

// API-34 (AC-30, BR-06, BR-33, BR-34)
describe('API-34 create validation', () => {
  it('rejects a duplicate email regardless of case, without creating anyone', async () => {
    const first = await createViaApi()
    const before = await prisma.user.count()
    const dup = await createViaApi({ email: first.body.email.toUpperCase() })
    expect(dup.status).toBe(409)
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_EMAIL', field: 'email' })
    expect(await prisma.user.count()).toBe(before)
  })

  it.each([
    ['name', { name: 'A' }, 'VALIDATION_ERROR'],
    ['name', { name: 'x'.repeat(101) }, 'VALIDATION_ERROR'],
    ['email', { email: 'not-an-email' }, 'VALIDATION_ERROR'],
    ['email', { email: `${'a'.repeat(250)}@x.io` }, 'VALIDATION_ERROR'],
    ['role', { role: 'SUPERUSER' }, 'VALIDATION_ERROR'],
    ['isActive', { isActive: 'yes' }, 'VALIDATION_ERROR'],
    ['initialPassword', { initialPassword: 'short1' }, 'WEAK_PASSWORD'],
    ['initialPassword', { initialPassword: 'nodigitshere' }, 'WEAK_PASSWORD'],
  ])('rejects a bad %s', async (field, overrides, code) => {
    const before = await prisma.user.count()
    const res = await createViaApi(overrides)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code, field })
    expect(await prisma.user.count()).toBe(before)
  })

  it('rejects a password equal to the email', async () => {
    const email = `same-${TAG}1@lab3.test`
    const res = await createViaApi({ email, initialPassword: email })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('WEAK_PASSWORD')
  })
})

// API-35 (AC-31, BR-13, BR-34)
describe('API-35 edit user', () => {
  it('changes name, email and role', async () => {
    const user = await createTestUser({ role: 'REQUESTER' })
    const res = await admin.agent.patch(`/api/admin/users/${user.id}`).send({
      name: 'Renamed Person',
      email: `Renamed-${TAG}@lab3.test`,
      role: 'IT_STAFF',
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Renamed Person', email: `renamed-${TAG}@lab3.test`, role: 'IT_STAFF' })
  })

  it('deactivating ends the user’s existing sessions at once', async () => {
    const { user, agent } = await createLoggedInUser({ role: 'REQUESTER' })
    expect((await agent.get('/api/auth/me')).status).toBe(200)

    const res = await admin.agent.patch(`/api/admin/users/${user.id}`).send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
    expect((await agent.get('/api/auth/me')).status).toBe(401)
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
  })

  it('rejects unknown fields, empty bodies, duplicate emails and missing users', async () => {
    const user = await createTestUser({ role: 'REQUESTER' })
    const other = await createTestUser({ role: 'REQUESTER' })

    const password = await admin.agent.patch(`/api/admin/users/${user.id}`).send({ passwordHash: 'x' })
    expect(password.status).toBe(400)
    expect((await admin.agent.patch(`/api/admin/users/${user.id}`).send({})).status).toBe(400)

    const dup = await admin.agent.patch(`/api/admin/users/${user.id}`).send({ email: other.email.toUpperCase() })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_EMAIL')

    expect((await admin.agent.patch('/api/admin/users/999999999').send({ name: 'Ghost User' })).status).toBe(404)
  })
})

// API-36 (AC-32, BR-35)
describe('API-36 set a new initial password', () => {
  it('signs the user out everywhere and forces a password change at next sign-in', async () => {
    const { user, agent } = await createLoggedInUser({ role: 'IT_STAFF' })
    const res = await admin.agent.post(`/api/admin/users/${user.id}/initial-password`).send({ initialPassword: 'Restart2026' })
    expect(res.status).toBe(200)
    expect(res.body.mustChangePassword).toBe(true)
    expect((await agent.get('/api/auth/me')).status).toBe(401)

    const old = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    expect(old.status).toBe(401)
    const fresh = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Restart2026' })
    expect(fresh.status).toBe(200)
    expect(fresh.body.user.mustChangePassword).toBe(true)
  })

  it('rejects a weak password and an unknown user', async () => {
    const user = await createTestUser({ role: 'IT_STAFF' })
    const weak = await admin.agent.post(`/api/admin/users/${user.id}/initial-password`).send({ initialPassword: 'abc' })
    expect(weak.status).toBe(400)
    expect(weak.body).toMatchObject({ code: 'WEAK_PASSWORD', field: 'initialPassword' })
    expect((await admin.agent.post('/api/admin/users/999999999/initial-password').send({ initialPassword: 'Restart2026' })).status).toBe(404)
  })
})

// API-37 (AC-33, BR-36)
describe('API-37 an admin can’t deactivate or demote themselves', () => {
  it('answers 409 SELF_MODIFICATION and changes nothing; renaming yourself is fine', async () => {
    const off = await admin.agent.patch(`/api/admin/users/${admin.user.id}`).send({ isActive: false })
    expect(off.status).toBe(409)
    expect(off.body.code).toBe('SELF_MODIFICATION')

    const demote = await admin.agent.patch(`/api/admin/users/${admin.user.id}`).send({ role: 'IT_STAFF' })
    expect(demote.body.code).toBe('SELF_MODIFICATION')

    const rename = await admin.agent.patch(`/api/admin/users/${admin.user.id}`).send({ name: `Admin ${TAG} renamed`, role: 'ADMIN', isActive: true })
    expect(rename.status).toBe(200)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } })
    expect(row).toMatchObject({ role: 'ADMIN', isActive: true })
  })
})

// API-38 (AC-34, BR-37): the only way to reach zero active admins through the
// API is two admins removing each other at the same moment. Every other
// active admin is switched off for this test and restored in `finally`.
describe('API-38 the last active Administrator', () => {
  it('two admins deactivating each other at once: one succeeds, one gets 409 LAST_ADMIN', async () => {
    const a = await createLoggedInUser({ role: 'ADMIN' })
    const b = await createLoggedInUser({ role: 'ADMIN' })
    const others = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, id: { notIn: [a.user.id, b.user.id] } },
      select: { id: true },
    })
    const otherIds = others.map((o) => o.id)
    try {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: false } })

      // Make the overlap deterministic. Fired "together", the second request
      // can arrive after the first already finished and simply find its
      // session gone (401) — safe, but it never reaches the lock. So the test
      // holds the same row lock itself, waits until BOTH requests are queued
      // behind it, then releases them.
      let pending!: Promise<request.Response[]>
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`
          pending = Promise.all([
            a.agent.patch(`/api/admin/users/${b.user.id}`).send({ isActive: false }),
            b.agent.patch(`/api/admin/users/${a.user.id}`).send({ isActive: false }),
          ])
          const deadline = Date.now() + 8000
          for (;;) {
            const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE wait_event_type = 'Lock' AND query LIKE '%"User"%FOR UPDATE%'`
            if (n >= 2) break
            if (Date.now() > deadline) throw new Error('requests never queued on the admin lock')
            await new Promise((r) => setTimeout(r, 20))
          }
          // Commit (releasing the lock) only once both are waiting on it.
        },
        { timeout: 15000 },
      )
      const [ab, ba] = await pending
      const statuses = [ab.status, ba.status].sort()
      expect(statuses).toEqual([200, 409])
      expect([ab, ba].find((r) => r.status === 409)!.body.code).toBe('LAST_ADMIN')
      expect(await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })).toBe(1)
    } finally {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: true } })
    }
  })

  it('demoting the only other admin is fine while you stay active', async () => {
    const other = await createTestUser({ role: 'ADMIN' })
    const res = await admin.agent.patch(`/api/admin/users/${other.id}`).send({ role: 'IT_STAFF' })
    expect(res.status).toBe(200)
  })
})

// API-39 (AC-35)
describe('API-39 only Administrators', () => {
  it.each(['REQUESTER', 'IT_STAFF'] as const)('%s gets 403 on every admin endpoint', async (role) => {
    const { agent } = await createLoggedInUser({ role })
    const target = await createTestUser({ role: 'REQUESTER' })
    expect((await agent.get('/api/admin/users')).status).toBe(403)
    expect((await agent.post('/api/admin/users').send(newUserBody())).status).toBe(403)
    expect((await agent.patch(`/api/admin/users/${target.id}`).send({ name: 'Hacked Name' })).status).toBe(403)
    expect((await agent.post(`/api/admin/users/${target.id}/initial-password`).send({ initialPassword: 'Hacked2026' })).status).toBe(403)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).name).not.toBe('Hacked Name')
  })

  it('no session → 401', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401)
  })
})
