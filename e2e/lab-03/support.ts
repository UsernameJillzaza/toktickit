import { randomBytes } from 'node:crypto'
import { expect, request } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import './load-env'
import { prisma } from '../../server/src/db'

// Shared helpers for e2e/lab-03. Every user an E2E run needs is created
// fresh through the real admin API, with an email that carries this run's
// tag, and removed again by cleanupRun(). Seeded accounts are only used to
// sign in as the administrator who creates them, so screenshots and tests
// never depend on — or change — the demo data.

export const API = 'http://localhost:3000'
export const RUN = randomBytes(3).toString('hex')
export const READY_PASSWORD = 'E2eReady2026'
export const INITIAL_PASSWORD = 'E2eFirst2026'

// Seeded administrator (README step 5). Local-dev credentials only.
const SEED_ADMIN = { email: 'napat.chaiwong@toktickit.test', password: 'TokTick2026!' }

export type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMIN'
export type E2EUser = { id: number; name: string; email: string; password: string; role: Role }

let counter = 0
export const runEmail = (label: string) => `e2e-${RUN}-${label}-${++counter}@lab3.test`

async function apiAs(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API })
  const res = await ctx.post('/api/auth/login', { data: { email, password } })
  expect(res.status(), `API login as ${email}`).toBe(200)
  return ctx
}

/** Logs the API session out (no stray Session rows) and closes the context. */
async function done(ctx: APIRequestContext) {
  await ctx.post('/api/auth/logout')
  await ctx.dispose()
}

/**
 * Creates a user through POST /api/admin/users. `ready: true` also signs in
 * as them and changes the initial password, so the UI can go straight in;
 * otherwise they still have to choose a new password at first sign-in.
 */
export async function createUser(role: Role, name: string, options: { ready?: boolean; isActive?: boolean } = {}): Promise<E2EUser> {
  const admin = await apiAs(SEED_ADMIN.email, SEED_ADMIN.password)
  const email = runEmail(role.toLowerCase())
  const created = await admin.post('/api/admin/users', {
    data: { name, email, role, isActive: options.isActive ?? true, initialPassword: INITIAL_PASSWORD },
  })
  expect(created.status(), `create ${role}`).toBe(201)
  const { id } = await created.json()
  await done(admin)

  if (!options.ready) return { id, name, email, password: INITIAL_PASSWORD, role }

  const self = await apiAs(email, INITIAL_PASSWORD)
  const changed = await self.post('/api/auth/change-password', {
    data: { currentPassword: INITIAL_PASSWORD, newPassword: READY_PASSWORD },
  })
  expect(changed.status()).toBe(200)
  await done(self)
  return { id, name, email, password: READY_PASSWORD, role }
}

/** Signs in through the real Login screen. */
export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel(/^email/i).fill(user.email)
  await page.getByLabel(/^password/i).fill(user.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('heading', { name: /sign in to toktickit/i })).toBeHidden()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: /log out/i }).click()
  await expect(page.getByRole('heading', { name: /sign in to toktickit/i })).toBeVisible()
}

/** Removes every row this run created (users tagged with RUN and what they own). */
export async function cleanupRun() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: `e2e-${RUN}-` } }, select: { id: true } })
  const ids = users.map((u) => u.id)
  if (ids.length === 0) return
  const tickets = await prisma.ticket.findMany({ where: { requesterId: { in: ids } }, select: { id: true } })
  const ticketIds = tickets.map((t) => t.id)
  const byTicketOrAuthor = { OR: [{ ticketId: { in: ticketIds } }, { authorId: { in: ids } }] }
  await prisma.publicComment.deleteMany({ where: byTicketOrAuthor })
  await prisma.internalNote.deleteMany({ where: byTicketOrAuthor })
  await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } })
  await prisma.ticket.updateMany({ where: { ownerId: { in: ids } }, data: { ownerId: null } })
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}

export async function disconnect() {
  await prisma.$disconnect()
}

/** Asserts the page has no horizontal overflow (RESP-01). */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, 'horizontal overflow').toBeLessThanOrEqual(clientWidth)
}

export const shot = (folder: string, name: string) => `artifacts/lab-03/screenshots/${folder}/${name}.png`
