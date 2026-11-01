import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { apiAs, cleanupRun, closeApi, createTicket, createUser, disconnect, settle, signIn } from './support'
import type { E2EUser } from './support'

// E2E-04 (BR-36, AC-41): walk every page a user can reach from the menu and
// from the links on those pages, as each role, and fail on anything a user
// would call broken: a console error, a failed API request, a link that lands
// on "Page not found" or "You don't have access", placeholder text, or an
// obsolete element from an earlier lab.

let requester: E2EUser
let staff: E2EUser
let admin: E2EUser

test.beforeAll(async () => {
  requester = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  staff = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
  admin = await createUser('ADMIN', 'Mali Admin', { ready: true })

  // Enough data that every list, panel and detail page has something to link to.
  const first = await createTicket(requester, 'Hardening walk: projector shows no signal', 'HIGH')
  await createTicket(requester, 'Hardening walk: badge reader offline')
  const api = await apiAs(staff)
  await api.put(`/api/staff/tickets/${first.id}/owner`, { data: { ownerId: staff.id } })
  const made = await api.post(`/api/staff/tickets/${first.id}/actions`, { data: { requestKey: `walk-${first.id}`, description: 'Re-seated the HDMI cable' } })
  expect(made.status()).toBe(201)
  await api.post(`/api/staff/tickets/${first.id}/notes`, { data: { body: 'Checked the switcher first.' } })
  await api.post(`/api/tickets/${first.id}/comments`, { data: { body: 'Looking at it now.' } })
  await closeApi(api)
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

const PLACEHOLDER = /lorem ipsum|\bTODO\b|\bFIXME\b|coming soon|\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/i
const OBSOLETE = [/development requester/i, /system status/i, /select a requester/i]

type Findings = string[]

/** Starts listening; call after sign-in so the pre-login 401 of /api/auth/me is not counted. */
function watch(page: Page): Findings {
  const found: Findings = []
  page.on('console', (m) => {
    if (m.type() === 'error') found.push(`console error: ${m.text()}`)
  })
  page.on('pageerror', (e) => found.push(`uncaught error: ${e.message}`))
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) found.push(`failed request: ${r.status()} ${new URL(r.url()).pathname}`)
  })
  page.on('requestfailed', (r) => found.push(`request failed: ${r.url()} (${r.failure()?.errorText})`))
  return found
}

/** What a user can see on the page right now, checked for the things that should never be there. */
async function inspect(page: Page, where: string, found: Findings) {
  await settle(page)
  const text = await page.locator('body').innerText()
  const hit = text.match(PLACEHOLDER)
  if (hit) found.push(`${where}: placeholder-like text "${hit[0]}"`)
  // Obsolete UI means the screen's own controls and headings, not ticket content
  // (a seeded Lab 2 evidence ticket legitimately mentions "Development Requester").
  const chrome = (await page.locator('nav, h1, h2, h3, button, label, a[href^="/"]').allInnerTexts()).join('\n')
  for (const re of OBSOLETE) if (re.test(chrome)) found.push(`${where}: obsolete element ${re}`)
  const headings = await page.getByRole('heading', { level: 1 }).allInnerTexts()
  if (headings.some((h) => /page not found/i.test(h))) found.push(`${where}: lands on Page not found`)
  if (headings.some((h) => /don't have access/i.test(h))) found.push(`${where}: lands on Forbidden`)
  if (headings.length === 0) found.push(`${where}: no page heading`)
}

/** The internal links in the menu and in the page body, without duplicates, as paths. */
async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))
  return [...new Set(hrefs)].filter((h) => !h.startsWith('/api/'))
}

/** `/staff/tickets/12?x=1` and `/staff/tickets/13` are the same kind of page: `/staff/tickets/:id`. */
const routeOf = (path: string) => path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id')
const PER_ROUTE = 3 // visit up to three different links of each kind of page

async function walk(page: Page, user: E2EUser, startsWith: string[]) {
  await signIn(page, user)
  const found = watch(page)
  await settle(page)
  await inspect(page, 'after sign-in', found)

  // Level 1: the menu. Level 2: every link found on each of those pages (detail pages, drill-downs).
  const queue = [...new Set([...startsWith, ...(await internalLinks(page))])]
  const seen = new Set<string>()
  const perRoute = new Map<string, number>()
  const visited: string[] = []
  while (queue.length > 0 && visited.length < 60) {
    const path = queue.shift()!
    const route = routeOf(path)
    if (seen.has(path) || route === '/change-password' || (perRoute.get(route) ?? 0) >= PER_ROUTE) continue
    seen.add(path)
    perRoute.set(route, (perRoute.get(route) ?? 0) + 1)
    await page.goto(path)
    await inspect(page, path, found)
    visited.push(path)
    for (const next of await internalLinks(page)) if (!seen.has(next)) queue.push(next)
  }
  return { found, visited, routes: [...perRoute.keys()].sort() }
}

test.describe('E2E-04 every reachable page, as each role', () => {
  test('Requester', async ({ page }) => {
    const { found, routes } = await walk(page, requester, ['/dashboard', '/my-tickets', '/create-ticket'])
    expect(routes, 'kinds of page reached').toEqual(['/create-ticket', '/dashboard', '/my-tickets', '/tickets/:id'])
    expect(found, found.join('\n')).toEqual([])
  })

  test('IT Staff', async ({ page }) => {
    const { found, routes } = await walk(page, staff, ['/dashboard', '/staff/queue'])
    expect(routes, 'kinds of page reached').toEqual(['/dashboard', '/staff/queue', '/staff/tickets/:id'])
    expect(found, found.join('\n')).toEqual([])
  })

  test('Administrator', async ({ page }) => {
    const { found, routes } = await walk(page, admin, ['/dashboard', '/staff/queue', '/admin/users'])
    expect(routes, 'kinds of page reached').toEqual(['/admin/users', '/dashboard', '/staff/queue', '/staff/tickets/:id'])
    expect(found, found.join('\n')).toEqual([])
  })

  test('the menu of each role holds exactly its destinations, first the Dashboard', async ({ page }) => {
    for (const [user, labels] of [
      [requester, ['Dashboard', 'My Tickets', 'Create Ticket']],
      [staff, ['Dashboard', 'Ticket Queue']],
      [admin, ['Dashboard', 'Ticket Queue', 'User Management']],
    ] as const) {
      await signIn(page, user)
      const items = await page.getByRole('navigation').getByRole('link').allInnerTexts()
      expect(items.filter((t) => (labels as readonly string[]).includes(t))).toEqual(labels)
      await page.getByRole('button', { name: /log out/i }).click()
      await expect(page.getByRole('heading', { name: /sign in to toktickit/i })).toBeVisible()
    }
  })
})
