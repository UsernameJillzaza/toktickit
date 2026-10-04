import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { hashToken } from '../../src/auth/session'
import { verifyPassword } from '../../src/auth/password'
import { cleanupTestUsers, createTestUser, loginAgent, TEST_PASSWORD } from '../helpers/auth'

afterAll(async () => {
  await cleanupTestUsers()
  await prisma.$disconnect()
})

function sessionCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined
  return raw?.find((c) => c.startsWith('tt_session='))
}

function tokenFrom(cookie: string): string {
  return cookie.split(';')[0].split('=')[1]
}

// API-01 (AC-01, BR-11)
describe('API-01 valid login', () => {
  it('returns the user identity + role and sets an HttpOnly SameSite=Lax session cookie', async () => {
    const user = await createTestUser({ role: 'IT_STAFF' })
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'IT_STAFF',
      mustChangePassword: false,
    })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/)

    const cookie = sessionCookie(res)
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Path=\//)
  })

  it('accepts the email with different case and surrounding spaces (BR-06)', async () => {
    const user = await createTestUser()
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `  ${user.email.toUpperCase()}  `, password: TEST_PASSWORD })
    expect(res.status).toBe(200)
  })
})

// API-02 (AC-05, BR-07)
describe('API-02 invalid credentials are indistinguishable', () => {
  it('wrong password and unknown email return the identical 401 and no cookie', async () => {
    const user = await createTestUser()
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Wrongpass999' })
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody-here@lab3.test', password: 'Wrongpass999' })

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' })
      expect(sessionCookie(res)).toBeUndefined()
    }
  })

  it('an account with no password issued yet behaves like a wrong password (BR-40)', async () => {
    const user = await createTestUser({ password: null })
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Anything123' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_CREDENTIALS')
  })

  it('missing fields are a 400 with the field name, not a 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: '' })
    expect(res.status).toBe(400)
    expect(res.body.field).toBe('email')
  })
})

// API-03 (AC-06, BR-01, BR-07)
describe('API-03 inactive accounts', () => {
  it('correct password on an inactive account is a 403 ACCOUNT_INACTIVE with no session', async () => {
    const user = await createTestUser({ isActive: false })
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('ACCOUNT_INACTIVE')
    expect(sessionCookie(res)).toBeUndefined()
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
  })

  it('wrong password on an inactive account reveals nothing beyond the generic 401', async () => {
    const user = await createTestUser({ isActive: false })
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrongpass999' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_CREDENTIALS')
  })
})

// API-04 (AC-09, FR-03)
describe('API-04 current user', () => {
  it('returns the signed-in user with a cookie and 401 without one', async () => {
    const user = await createTestUser({ role: 'ADMIN' })
    const agent = await loginAgent(user)

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user).toMatchObject({ id: user.id, role: 'ADMIN' })

    const anonymous = await request(app).get('/api/auth/me')
    expect(anonymous.status).toBe(401)
    expect(anonymous.body.code).toBe('UNAUTHENTICATED')
  })

  it('treats a deactivated user as signed out on the very next request (BR-13)', async () => {
    const user = await createTestUser()
    const agent = await loginAgent(user)
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })
})

// API-05 (AC-07, BR-12)
describe('API-05 logout', () => {
  it('ends the session so the same cookie no longer works', async () => {
    const user = await createTestUser()
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    const cookie = sessionCookie(login)!.split(';')[0]

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(logout.status).toBe(204)
    expect(sessionCookie(logout)).toMatch(/tt_session=;/) // cleared

    const reuse = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(reuse.status).toBe(401)
  })

  it('logout without a session is a 401', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401)
  })
})

// API-06 (AC-02, BR-02): a user with an initial password can sign in, see
// who they are and change the password, but every other API answers 403
// PASSWORD_CHANGE_REQUIRED until they do.
describe('API-06 initial password', () => {
  it('blocks My Tickets with 403 PASSWORD_CHANGE_REQUIRED until the password is changed', async () => {
    const user = await createTestUser({ mustChangePassword: true })
    const agent = await loginAgent(user)

    const blocked = await agent.get('/api/tickets')
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')

    await agent.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: 'Brandnew456' })
    expect((await agent.get('/api/tickets')).status).toBe(200)
  })

  it('signs in with mustChangePassword true, then clears it after a valid change', async () => {
    const user = await createTestUser({ mustChangePassword: true })
    const agent = await loginAgent(user)
    expect((await agent.get('/api/auth/me')).body.user.mustChangePassword).toBe(true)

    const change = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Brandnew456' })
    expect(change.status).toBe(200)
    expect(change.body.user.mustChangePassword).toBe(false)
    expect((await agent.get('/api/auth/me')).body.user.mustChangePassword).toBe(false)
  })
})

// API-07 (AC-08, BR-10)
describe('API-07 change-password validation', () => {
  it('rejects a wrong current password, a weak password and a reused password — and changes nothing', async () => {
    const user = await createTestUser()
    const agent = await loginAgent(user)
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash

    const wrongCurrent = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'Notmypass1', newPassword: 'Brandnew456' })
    expect(wrongCurrent.status).toBe(400)
    expect(wrongCurrent.body.field).toBe('currentPassword')

    const weak = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short1' })
    expect(weak.status).toBe(400)
    expect(weak.body).toMatchObject({ code: 'WEAK_PASSWORD', field: 'newPassword' })

    const noDigit = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'onlyletters' })
    expect(noDigit.body.code).toBe('WEAK_PASSWORD')

    const reuse = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
    expect(reuse.status).toBe(400)
    expect(reuse.body).toMatchObject({ code: 'PASSWORD_REUSE', field: 'newPassword' })

    const after = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash
    expect(after).toBe(before)
  })

  it('a successful change signs out other sessions but keeps the current one', async () => {
    const user = await createTestUser()
    const laptop = await loginAgent(user)
    const phone = await loginAgent(user)

    const change = await laptop
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Brandnew456' })
    expect(change.status).toBe(200)

    expect((await laptop.get('/api/auth/me')).status).toBe(200)
    expect((await phone.get('/api/auth/me')).status).toBe(401)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(await verifyPassword('Brandnew456', stored.passwordHash!)).toBe(true)
  })
})

// API-08 (BR-11, D-03)
describe('API-08 session storage', () => {
  it('stores only SHA-256 of the cookie token, never the token itself', async () => {
    const user = await createTestUser()
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    const token = tokenFrom(sessionCookie(res)!)

    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(await prisma.session.findUnique({ where: { id: token } })).toBeNull()
    const stored = await prisma.session.findUnique({ where: { id: hashToken(token) } })
    expect(stored?.userId).toBe(user.id)
  })
})

// API-09 (BR-11)
describe('API-09 session expiry', () => {
  it('an expired session is unauthenticated and its row is removed', async () => {
    const user = await createTestUser()
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    const cookie = sessionCookie(res)!.split(';')[0]
    const id = hashToken(tokenFrom(cookie))

    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(401)
    expect(await prisma.session.findUnique({ where: { id } })).toBeNull()
  })
})

describe('malformed JSON', () => {
  it('is a 400, not a 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })
})
