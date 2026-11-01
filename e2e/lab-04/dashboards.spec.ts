import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { apiAs, cleanupRun, closeApi, createTicket, createUser, disconnect, expectNoHorizontalOverflow, prisma, shot, signIn, VIEWPORTS } from './support'
import type { E2EUser } from './support'

// E2E-03 (AC-25 … AC-34): the three dashboards in a real browser. The numbers
// on the cards are compared with the lists they open and with direct database
// counts, the zero / loading / failure states are shown, and the evidence
// screenshots for staff-dashboard/ and requester-dashboard/ are captured.
//
// Fixture shortcut: ticket statuses and ages are set straight in the database
// for the Requester's tickets (reaching Resolved through the UI needs an owner
// and a completed Action, which E2E-02 already covers).

let reqA: E2EUser
let reqB: E2EUser
let reqEmpty: E2EUser
let staff: E2EUser
let admin: E2EUser

const DAY = 24 * 60 * 60 * 1000

test.beforeAll(async () => {
  reqA = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  reqB = await createUser('REQUESTER', 'Somchai Other', { ready: true })
  reqEmpty = await createUser('REQUESTER', 'Nida Newcomer', { ready: true })
  staff = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
  admin = await createUser('ADMIN', 'Mali Admin', { ready: true })

  // Ploy: two open (one of them waiting for her), one resolved this week, one resolved long ago.
  await createTicket(reqA, 'Dash: new ticket about the badge reader')
  const waiting = await createTicket(reqA, 'Dash: printer asks the requester for a driver version')
  const resolved = await createTicket(reqA, 'Dash: resolved projector problem')
  const old = await createTicket(reqA, 'Dash: resolved long ago')
  await prisma.ticket.update({ where: { id: waiting.id }, data: { currentStatus: 'WAITING_FOR_REQUESTER' } })
  await prisma.ticket.update({ where: { id: resolved.id }, data: { currentStatus: 'RESOLVED' } })
  await prisma.ticket.update({ where: { id: old.id }, data: { currentStatus: 'RESOLVED', updatedAt: new Date(Date.now() - 40 * DAY) } })

  // Somchai has his own, which must never show on Ploy's screen.
  await createTicket(reqB, 'Dash: ticket of another requester')
  await createTicket(reqB, 'Dash: second ticket of another requester')

  // Something for the staff to see: one unassigned critical ticket and one the requester reports as resolved.
  const critical = await createTicket(reqB, 'Dash: critical outage in the lab', 'HIGH')
  await prisma.ticket.update({ where: { id: critical.id }, data: { itPriority: 'CRITICAL' } })
  const reported = await createTicket(reqB, 'Dash: requester says it works again')
  await prisma.ticket.update({ where: { id: reported.id }, data: { requesterResolvedAt: new Date() } })
  const api = await apiAs(staff)
  await api.put(`/api/staff/tickets/${reported.id}/owner`, { data: { ownerId: staff.id } })
  const made = await api.post(`/api/staff/tickets/${reported.id}/actions`, { data: { requestKey: `dash-${reported.id}`, description: 'Restarted the lab gateway' } })
  expect(made.status()).toBe(201)
  await closeApi(api)
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

async function open(browser: Browser, user: E2EUser, width = 1280, height = 900): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage()
  await signIn(page, user)
  return page
}

const card = (page: Page, name: string) => page.getByRole('group', { name })
const cardValue = async (page: Page, name: string) => Number((await card(page, name).locator('.display-6').innerText()).replace(/\D/g, ''))

/** The total a list screen reports ("12 tickets"), or 0 when it says nothing matches. */
async function listedTotal(page: Page): Promise<number> {
  const count = page.getByText(/^\d+ tickets?$/)
  const none = page.getByText(/^No tickets match/)
  await expect(count.or(none)).toBeVisible()
  if (await none.isVisible()) return 0
  return Number((await count.innerText()).match(/\d+/)![0])
}
const tableRows = async (page: Page) => (await page.getByRole('table').getByRole('row').count()) - 1

test('E2E-03 the Requester dashboard: numbers, lists, drill-down and isolation', async ({ browser }) => {
  const page = await open(browser, reqA)
  // AC-34: signing in lands on the Dashboard, which is the first, current menu item.
  await expect(page).toHaveURL(/\/dashboard$/)
  const menu = page.getByRole('navigation').getByRole('link')
  expect((await menu.allInnerTexts())[0]).toBe('Dashboard')
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')

  // AC-25, AC-26: the cards, computed for Ploy only.
  await expect(card(page, 'Open tickets')).toBeVisible()
  expect(await cardValue(page, 'Open tickets')).toBe(2)
  expect(await cardValue(page, 'Waiting for you')).toBe(1)
  expect(await cardValue(page, 'Resolved (last 30 days)')).toBe(1) // the one resolved 40 days ago is outside the window

  const attention = page.getByRole('region', { name: 'Needs your attention' })
  await expect(attention).toContainText('Dash: printer asks the requester for a driver version')
  const recent = page.getByRole('region', { name: 'Recently updated' })
  await expect(recent.getByRole('listitem')).toHaveCount(4)
  await expect(page.getByText('another requester')).toHaveCount(0) // isolation
  await expect(page.getByText(/priority/i)).toHaveCount(0) // BR-28: no IT Priority for a Requester
  await page.screenshot({ path: shot('requester-dashboard', 'dashboard-desktop'), fullPage: true })

  // AC-31: each card opens the list that has exactly the card's number of rows.
  for (const [name, view, chip] of [
    ['Open tickets', 'View open tickets', 'Status: Open tickets'],
    ['Waiting for you', 'View tickets waiting for you', 'Status: Waiting for Requester'],
    ['Resolved (last 30 days)', 'View tickets resolved in the last 30 days', 'Updated in the last 30 days'],
  ] as const) {
    await page.goto('/dashboard')
    const number = await cardValue(page, name)
    await card(page, name).getByRole('link', { name: view }).click()
    await expect(page.getByText(chip)).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    expect(await tableRows(page), `${name} list`).toBe(number)
  }
  await page.screenshot({ path: shot('requester-dashboard', 'drill-down-result'), fullPage: true })

  // Responsive: no horizontal overflow, one screenshot per width.
  await page.goto('/dashboard')
  for (const vp of VIEWPORTS.filter((v) => v.name !== 'desktop')) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await expect(card(page, 'Open tickets')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: shot('requester-dashboard', `dashboard-${vp.name}`), fullPage: true })
  }

  // The other requester gets a different dashboard from the same endpoint.
  const other = await open(browser, reqB)
  await expect(card(other, 'Open tickets')).toBeVisible()
  await expect(other.getByRole('region', { name: 'Recently updated' })).toContainText('another requester')
  await expect(other.getByText('Dash: printer asks the requester')).toHaveCount(0)
  await other.screenshot({ path: shot('requester-dashboard', 'other-requester-isolation'), fullPage: true })
})

test('E2E-03 a Requester with no tickets sees zeros and empty sentences, not a blank page', async ({ browser }) => {
  const page = await open(browser, reqEmpty)
  for (const name of ['Open tickets', 'Waiting for you', 'Resolved (last 30 days)']) expect(await cardValue(page, name)).toBe(0)
  await expect(page.getByText('No tickets need your attention.')).toBeVisible()
  await expect(page.getByText("You haven't created any tickets yet.")).toBeVisible()
  await page.screenshot({ path: shot('requester-dashboard', 'dashboard-empty'), fullPage: true })
})

test('E2E-03 the IT Staff dashboard: cards equal the lists they open and the database', async ({ browser }) => {
  const page = await open(browser, staff)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(card(page, 'Unassigned')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Users' })).toHaveCount(0) // administrators only

  // Cards against direct database counts (AC-27).
  const active = { currentStatus: { notIn: ['CLOSED', 'CANCELLED'] as ('CLOSED' | 'CANCELLED')[] } }
  const db = {
    unassigned: await prisma.ticket.count({ where: { ...active, ownerId: null } }),
    mine: await prisma.ticket.count({ where: { ...active, ownerId: staff.id } }),
    reported: await prisma.ticket.count({ where: { ...active, requesterResolvedAt: { not: null } } }),
    critical: await prisma.ticket.count({ where: { ...active, itPriority: 'CRITICAL' } }),
    newTickets: await prisma.ticket.count({ where: { currentStatus: 'NEW' } }),
  }
  const ui = {
    unassigned: await cardValue(page, 'Unassigned'),
    mine: await cardValue(page, 'Assigned to me'),
    reported: await cardValue(page, 'Requester reports resolved'),
  }
  expect(ui).toEqual({ unassigned: db.unassigned, mine: db.mine, reported: db.reported })
  expect(db.reported).toBeGreaterThan(0)
  expect(db.critical).toBeGreaterThan(0)
  await expect(page.getByRole('region', { name: 'Urgent' })).toContainText('Dash: critical outage in the lab')
  await expect(page.getByRole('region', { name: 'My recent actions' })).toContainText('Restarted the lab gateway')
  await page.screenshot({ path: shot('staff-dashboard', 'dashboard-desktop'), fullPage: true })

  // Each card opens a list whose total is the card's number (AC-31).
  for (const [name, view, expected] of [
    ['Unassigned', 'View unassigned tickets', db.unassigned],
    ['Assigned to me', 'View tickets assigned to me', db.mine],
    ['Requester reports resolved', 'View tickets the requester reports as resolved', db.reported],
  ] as const) {
    await page.goto('/dashboard')
    await card(page, name).getByRole('link', { name: view }).click()
    expect(await listedTotal(page), name).toBe(expected)
  }
  await expect(page.getByText('Requester reports resolved').first()).toBeVisible() // the chip of the last drill-down
  await page.screenshot({ path: shot('staff-dashboard', 'drill-down-result'), fullPage: true })

  // The status and priority panels link to the same filters.
  await page.goto('/dashboard')
  const newCount = Number((await page.getByRole('region', { name: 'By status' }).getByRole('listitem').filter({ hasText: /^New/ }).innerText()).replace(/\D/g, ''))
  expect(newCount).toBe(db.newTickets)
  await page.getByRole('region', { name: 'By status' }).getByRole('link', { name: 'View New tickets' }).click()
  expect(await listedTotal(page)).toBe(db.newTickets)
  await page.goto('/dashboard')
  await page.getByRole('region', { name: 'By IT priority (active)' }).getByRole('link', { name: /View active Critical priority/ }).click()
  expect(await listedTotal(page)).toBe(db.critical)

  // Evidence that the numbers come from the database: both sides on one page.
  await page.goto('/dashboard')
  const evidence = await (await page.context().newPage())
  await evidence.setContent(`<html><body style="font:16px/1.5 system-ui;padding:24px">
    <h1 style="font-size:20px">Metric vs database (IT Staff dashboard, ${new Date().toISOString()})</h1>
    <table border="1" cellpadding="8" style="border-collapse:collapse">
      <tr><th>Card</th><th>Dashboard shows</th><th>Direct database count</th><th>Match</th></tr>
      <tr><td>Unassigned</td><td>${ui.unassigned}</td><td>${db.unassigned}</td><td>${ui.unassigned === db.unassigned ? 'yes' : 'NO'}</td></tr>
      <tr><td>Assigned to me</td><td>${ui.mine}</td><td>${db.mine}</td><td>${ui.mine === db.mine ? 'yes' : 'NO'}</td></tr>
      <tr><td>Requester reports resolved</td><td>${ui.reported}</td><td>${db.reported}</td><td>${ui.reported === db.reported ? 'yes' : 'NO'}</td></tr>
      <tr><td>By status: New</td><td>${newCount}</td><td>${db.newTickets}</td><td>${newCount === db.newTickets ? 'yes' : 'NO'}</td></tr>
    </table>
    <p>Database counts: <code>Ticket</code> rows not Closed/Cancelled, with owner null / owner = signed-in user / requesterResolvedAt set; status = NEW.</p>
  </body></html>`)
  await evidence.screenshot({ path: shot('staff-dashboard', 'metric-vs-database') })
  await evidence.close()

  // Responsive.
  for (const vp of VIEWPORTS.filter((v) => v.name !== 'desktop')) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await expect(card(page, 'Unassigned')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: shot('staff-dashboard', `dashboard-${vp.name}`), fullPage: true })
  }
})

test('E2E-03 loading, failure with Retry, and the zero state of the staff dashboard', async ({ browser }) => {
  const page = await open(browser, staff)

  // Loading: hold the answer back.
  await page.route('**/api/dashboard/staff', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {}) // the page may have moved on (and the route been removed) by now
  })
  await page.goto('/dashboard')
  await expect(page.getByRole('status', { name: 'Loading the dashboard' })).toBeVisible()
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  await page.screenshot({ path: shot('staff-dashboard', 'loading'), fullPage: true })
  await page.unroute('**/api/dashboard/staff')

  // Failure: a safe message with Retry; Retry works once the server answers.
  await page.route('**/api/dashboard/staff', (route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }))
  await page.goto('/dashboard')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText("We couldn't load the dashboard.")
  await expect(alert).not.toContainText('boom')
  await page.screenshot({ path: shot('staff-dashboard', 'failure'), fullPage: true })
  await page.unroute('**/api/dashboard/staff')
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(card(page, 'Unassigned')).toBeVisible()

  // Zero state: the screen's own handling of an all-zero answer (the shared database is never empty).
  const zero = {
    generatedAt: new Date().toISOString(),
    metrics: { unassigned: 0, myActive: 0, requesterReportsResolved: 0 },
    byStatus: Object.fromEntries(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'].map((s) => [s, 0])),
    byItPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    urgent: [],
    recentlyUpdated: [],
    myRecentActions: [],
  }
  await page.route('**/api/dashboard/staff', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(zero) }))
  await page.goto('/dashboard')
  expect(await cardValue(page, 'Unassigned')).toBe(0)
  await expect(page.getByText('No urgent tickets.')).toBeVisible()
  await expect(page.getByText("You haven't recorded any actions yet.")).toBeVisible()
  await page.screenshot({ path: shot('staff-dashboard', 'empty'), fullPage: true })
})

test('E2E-03 the Administrator also sees users; the wrong role is refused by the screen and by the API', async ({ browser }) => {
  const adminPage = await open(browser, admin)
  await expect(adminPage.getByRole('group', { name: 'Users' })).toBeVisible()
  const total = await prisma.user.count()
  expect(await cardValue(adminPage, 'Users')).toBe(total)
  await expect(adminPage.getByRole('region', { name: 'Users by role' })).toBeVisible()
  await adminPage.getByRole('group', { name: 'Users' }).getByRole('link', { name: 'View users' }).click()
  await expect(adminPage).toHaveURL(/\/admin\/users$/)
  await adminPage.screenshot({ path: shot('staff-dashboard', 'admin-users-card'), fullPage: true })

  // A Requester cannot use the staff dashboard, either through the API or by URL.
  const req = await open(browser, reqA)
  const refused = await req.request.get('/api/dashboard/staff')
  expect(refused.status()).toBe(403)
  await req.goto('/staff/queue')
  await expect(req.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  // And staff cannot use the Requester dashboard through the API.
  const staffPage = await open(browser, staff)
  expect((await staffPage.request.get('/api/dashboard/requester')).status()).toBe(403)
})
