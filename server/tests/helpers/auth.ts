import { randomBytes } from 'node:crypto'
import request from 'supertest'
import app from '../../src/app'
import { prisma } from '../../src/db'
import { hashPassword } from '../../src/auth/password'
import type { Role } from '../../src/generated/prisma/client'

// Shared by every Lab 3 API test (and the Lab 2 suites once they log in).
// Tests create their own users with random @lab3.test emails instead of
// relying on seed data, and remove everything they created in afterAll.

export const TEST_PASSWORD = 'Testpass123'

export type TestAgent = ReturnType<typeof request.agent>

const createdUserIds: number[] = []

export type TestUser = { id: number; name: string; email: string; role: Role; password: string }

export async function createTestUser(
  options: { role?: Role; isActive?: boolean; mustChangePassword?: boolean; password?: string | null; name?: string } = {},
): Promise<TestUser> {
  const role = options.role ?? 'REQUESTER'
  const password = options.password === undefined ? TEST_PASSWORD : options.password
  const tag = randomBytes(5).toString('hex')
  const user = await prisma.user.create({
    data: {
      name: options.name ?? `Test ${role} ${tag}`,
      email: `t-${tag}@lab3.test`,
      role,
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
      passwordHash: password === null ? null : await hashPassword(password),
    },
  })
  createdUserIds.push(user.id)
  return { id: user.id, name: user.name, email: user.email, role, password: password ?? '' }
}

// A supertest agent keeps cookies between requests, exactly like a browser
// holding the tt_session cookie.
export async function loginAgent(user: { email: string; password: string }): Promise<TestAgent> {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: user.password })
  if (res.status !== 200) {
    throw new Error(`loginAgent failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return agent
}

export async function createLoggedInUser(options: Parameters<typeof createTestUser>[0] = {}) {
  const user = await createTestUser(options)
  const agent = await loginAgent(user)
  return { user, agent }
}

export function trackUserForCleanup(id: number) {
  createdUserIds.push(id)
}

// Removes every row the test users own, children first (FKs are RESTRICT
// for tickets/attachments; sessions cascade).
export async function cleanupTestUsers() {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  const tickets = await prisma.ticket.findMany({ where: { requesterId: { in: ids } }, select: { id: true } })
  const ticketIds = tickets.map((t) => t.id)
  if (ticketIds.length > 0) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } })
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } })
  }
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}
