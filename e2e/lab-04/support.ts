import { expect, request } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { API } from '../lab-03/support'

// Helpers for e2e/lab-04. Users, sign-in, cleanup and the overflow check are
// Lab 3's (one place, one cleanup); this file adds the Lab 4 screenshot folder
// and a few API shortcuts for building the data a screen needs.

export { API, RUN, READY_PASSWORD, cleanupRun, createUser, disconnect, expectNoHorizontalOverflow, signIn, signOut } from '../lab-03/support'
export type { E2EUser } from '../lab-03/support'
export { prisma } from '../../server/src/db'

export const shot = (folder: string, name: string) => `artifacts/lab-04/screenshots/${folder}/${name}.png`

export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 375, height: 812 },
] as const

/** An API client signed in as `user` (the same cookie a browser would hold). */
export async function apiAs(user: { email: string; password: string }): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API })
  const res = await ctx.post('/api/auth/login', { data: { email: user.email, password: user.password } })
  expect(res.status(), `API login as ${user.email}`).toBe(200)
  return ctx
}

export async function closeApi(ctx: APIRequestContext) {
  await ctx.post('/api/auth/logout')
  await ctx.dispose()
}

/** Creates a Ticket as `requester` through the real API; returns its id and number. */
export async function createTicket(requester: { email: string; password: string }, summary: string, priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM') {
  const ctx = await apiAs(requester)
  const categories = await (await ctx.get('/api/categories')).json()
  const systems = await (await ctx.get('/api/related-systems')).json()
  const res = await ctx.post('/api/tickets', {
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary,
      description: `Fixture ticket for the Lab 4 E2E run: ${summary}`,
      requestedPriority: priority,
    },
  })
  expect(res.status(), 'create ticket').toBe(201)
  const body = await res.json()
  await closeApi(ctx)
  return { id: body.id as number, ticketNumber: body.ticketNumber as string }
}

/** Waits until the page has stopped changing the network (the SPA has drawn its data). */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
}
