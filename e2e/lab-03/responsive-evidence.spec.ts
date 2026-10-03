import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { API, cleanupRun, createUser, disconnect, expectNoHorizontalOverflow, shot, signIn } from './support'
import type { E2EUser } from './support'

// Lab 3 RESP-01 (AC-36): every main screen at desktop / tablet / mobile —
// no horizontal overflow, plus a screenshot per breakpoint.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 375, height: 812 },
] as const

let requester: E2EUser
let staff: E2EUser
let admin: E2EUser
let ticketId: number

test.beforeAll(async ({ playwright }) => {
  requester = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  staff = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
  admin = await createUser('ADMIN', 'Mali Admin', { ready: true })

  // One ticket with a comment and a note, so the detail screens have content.
  const asRequester = await playwright.request.newContext({ baseURL: API })
  await asRequester.post('/api/auth/login', { data: { email: requester.email, password: requester.password } })
  const categories = await (await asRequester.get('/api/categories')).json()
  const systems = await (await asRequester.get('/api/related-systems')).json()
  const created = await asRequester.post('/api/tickets', {
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary: 'Shared drive mapping disappears after every restart',
      description: 'The S: drive is gone each morning and has to be mapped again by hand.',
      requestedPriority: 'HIGH',
    },
  })
  ticketId = (await created.json()).id
  await asRequester.post(`/api/tickets/${ticketId}/comments`, { data: { body: 'It happens on both my laptops.' } })
  await asRequester.post('/api/auth/logout')
  await asRequester.dispose()

  const asStaff = await playwright.request.newContext({ baseURL: API })
  await asStaff.post('/api/auth/login', { data: { email: staff.email, password: staff.password } })
  await asStaff.put(`/api/staff/tickets/${ticketId}/owner`, { data: { ownerId: staff.id } })
  await asStaff.put(`/api/staff/tickets/${ticketId}/status`, { data: { status: 'IN_PROGRESS' } })
  await asStaff.post(`/api/staff/tickets/${ticketId}/notes`, { data: { body: 'Group policy drive map is missing for this OU.' } })
  await asStaff.post(`/api/tickets/${ticketId}/comments`, { data: { body: 'Checking the group policy now.' } })
  await asStaff.post('/api/auth/logout')
  await asStaff.dispose()
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

async function pageAs(browser: Browser, user: E2EUser | null): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  if (user) await signIn(page, user)
  return page
}

type Screen = { folder: string; name: string; who: () => E2EUser | null; path: () => string; ready: (page: Page) => Promise<void> }

const SCREENS: Screen[] = [
  { folder: 'authentication', name: 'login', who: () => null, path: () => '/login', ready: async (p) => expect(p.getByRole('heading', { name: 'Sign in to TokTickIT' })).toBeVisible() },
  { folder: 'authentication', name: 'change-password', who: () => requester, path: () => '/change-password', ready: async (p) => expect(p.getByRole('heading', { name: 'Change password' })).toBeVisible() },
  { folder: 'staff-queue', name: 'queue', who: () => staff, path: () => '/staff/queue', ready: async (p) => expect(p.getByText(/\d+ tickets?$/)).toBeVisible() },
  { folder: 'staff-ticket-detail', name: 'staff-detail', who: () => staff, path: () => `/staff/tickets/${ticketId}`, ready: async (p) => expect(p.getByText('Group policy drive map is missing for this OU.')).toBeVisible() },
  { folder: 'staff-ticket-detail', name: 'requester-detail', who: () => requester, path: () => `/tickets/${ticketId}`, ready: async (p) => expect(p.getByText('Checking the group policy now.')).toBeVisible() },
  { folder: 'user-management', name: 'users', who: () => admin, path: () => '/admin/users', ready: async (p) => expect(p.getByRole('button', { name: 'Edit Mali Admin' })).toBeVisible() },
]

for (const screen of SCREENS) {
  test(`RESP-01 ${screen.name} at 1280 / 820 / 375 px`, async ({ browser }) => {
    const page = await pageAs(browser, screen.who())
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(screen.path())
      await screen.ready(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: shot(screen.folder, `${screen.name}-${vp.name}`), fullPage: true })
    }
  })
}

test('RESP-01 mobile menu collapses behind the hamburger', async ({ browser }) => {
  const page = await pageAs(browser, admin)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/staff/queue')
  const menuLink = page.getByRole('navigation').getByRole('link', { name: 'User Management' })
  await expect(menuLink).toBeHidden()
  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await expect(menuLink).toBeVisible()
  await page.screenshot({ path: shot('authentication', 'mobile-menu-open'), fullPage: true })
})
