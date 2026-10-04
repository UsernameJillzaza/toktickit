import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cleanupRun, createUser, disconnect, shot, signIn } from './support'
import type { E2EUser } from './support'

// Lab 3 E2E-05 (AC-12, AC-17 … AC-23, AC-26): one ticket's whole life, with
// the Requester and IT Staff in two separate browser sessions side by side.
// Also captures the staff-queue/ and staff-ticket-detail/ screenshots.

let requester: E2EUser
let staff: E2EUser

test.beforeAll(async () => {
  requester = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  staff = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

const SUMMARY = 'Projector in room 401 shows no signal'
const NOTE = 'HDMI switcher in 401 was replaced last week — check its input first.'

async function chooseStatus(page: Page, label: string) {
  const ops = page.getByRole('region', { name: 'Operations' })
  await ops.getByLabel('Change status').selectOption({ label })
  await ops.getByRole('button', { name: 'Save status' }).click()
}

test('E2E-05 requester ↔ IT Staff: claim, prioritise, talk, resolve, close', async ({ browser }) => {
  const requesterPage = await (await browser.newContext()).newPage()
  const staffPage = await (await browser.newContext()).newPage()

  // 1. Requester creates a ticket and comments on it.
  await signIn(requesterPage, requester)
  await requesterPage.goto('/create-ticket')
  await requesterPage.getByLabel(/^category/i).selectOption({ label: 'Hardware' })
  await requesterPage.getByLabel(/^related system/i).selectOption({ index: 1 })
  await requesterPage.getByLabel(/^requested priority/i).selectOption('MEDIUM')
  await requesterPage.getByLabel(/^summary/i).fill(SUMMARY)
  await requesterPage.getByLabel(/^description/i).fill('The projector turns on but says "No signal" with every laptop we tried.')
  await requesterPage.getByRole('button', { name: /^submit$/i }).click()
  await expect(requesterPage.getByText('Ticket created')).toBeVisible()

  await requesterPage.goto('/my-tickets')
  const link = requesterPage.locator('a', { hasText: /^TKT-/ }).locator('visible=true').first()
  const ticketNumber = (await link.textContent())!.trim()
  const requesterDetail = new URL((await link.getAttribute('href'))!, 'http://x').pathname
  await requesterPage.goto(requesterDetail)
  await expect(requesterPage.getByText('Not yet assigned')).toBeVisible()
  const comments = requesterPage.getByRole('region', { name: /public comments/i })
  await comments.getByLabel('Add a public comment').fill('It started after the room was rearranged on Monday.')
  await comments.getByRole('button', { name: 'Post comment' }).click()
  await expect(comments.getByText('It started after the room was rearranged on Monday.')).toBeVisible()

  // 2. IT Staff finds it in the queue (unassigned).
  await signIn(staffPage, staff)
  await staffPage.getByRole('button', { name: 'Unassigned' }).click()
  await staffPage.getByRole('searchbox', { name: /search tickets/i }).fill(ticketNumber)
  await staffPage.getByRole('button', { name: /^search$/i }).click()
  const row = staffPage.getByRole('row').filter({ hasText: ticketNumber })
  await expect(row).toBeVisible()
  await expect(row.getByText('Unassigned')).toBeVisible()
  await staffPage.screenshot({ path: shot('staff-queue', 'queue-filtered-unassigned'), fullPage: true })

  // 3. Claim, raise IT Priority, internal note, public reply, In Progress.
  await row.getByRole('link', { name: ticketNumber }).click()
  const ops = staffPage.getByRole('region', { name: 'Operations' })
  await ops.getByRole('button', { name: 'Claim' }).click()
  await expect(ops.locator('strong', { hasText: 'Krit Staff' })).toBeVisible()

  await ops.getByLabel('IT Priority').selectOption('HIGH')
  await ops.getByRole('button', { name: 'Save priority' }).click()
  await expect(staffPage.getByText('IT High')).toBeVisible()

  const notes = staffPage.getByRole('region', { name: /internal notes/i })
  await notes.getByRole('textbox').fill(NOTE)
  await notes.getByRole('button', { name: 'Add internal note' }).click()
  await expect(notes.getByText(NOTE)).toBeVisible()

  const staffComments = staffPage.getByRole('region', { name: /public comments — visible to the requester/i })
  await expect(staffComments.getByText('It started after the room was rearranged on Monday.')).toBeVisible()
  await staffComments.getByRole('textbox').fill('Thanks — I will check the cabling this afternoon.')
  await staffComments.getByRole('button', { name: 'Post public comment' }).click()
  await expect(staffComments.getByText('Thanks — I will check the cabling this afternoon.')).toBeVisible()

  await chooseStatus(staffPage, 'In Progress')
  await expect(ops.getByText('Status:').locator('..')).toContainText('In Progress')
  await staffPage.screenshot({ path: shot('staff-ticket-detail', 'detail-in-progress'), fullPage: true })

  // 4. Requester sees the reply and the owner, never the note; reports resolved.
  await requesterPage.reload()
  await expect(requesterPage.getByText('Thanks — I will check the cabling this afternoon.')).toBeVisible()
  await expect(requesterPage.getByText('Krit Staff', { exact: true }).first()).toBeVisible()
  await expect(requesterPage.getByText(NOTE)).toHaveCount(0)
  await expect(requesterPage.getByText(/internal note/i)).toHaveCount(0)
  await requesterPage.getByRole('button', { name: 'Problem Appears Resolved' }).click()
  await expect(requesterPage.getByText(/you reported this problem as resolved on/i)).toBeVisible()
  await requesterPage.screenshot({ path: shot('staff-ticket-detail', 'requester-view-after-reply'), fullPage: true })

  // 5. IT Staff sees the indicator, resolves (with confirmation), then closes.
  await staffPage.reload()
  await expect(staffPage.getByText(/the requester reported this problem as resolved/i)).toBeVisible()

  await chooseStatus(staffPage, 'Resolved')
  const dialog = staffPage.getByRole('alertdialog', { name: 'Change status to Resolved?' })
  await expect(dialog).toBeVisible()
  await staffPage.screenshot({ path: shot('staff-ticket-detail', 'confirm-resolve'), fullPage: true })
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(ops.getByText('Status:').locator('..')).toContainText('Resolved')

  await chooseStatus(staffPage, 'Closed')
  await staffPage.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(ops.getByText(/this ticket is closed/i)).toBeVisible()
  await expect(ops.getByRole('combobox')).toHaveCount(0)
  await expect(staffComments.getByText('This ticket is closed. New comments are disabled.')).toBeVisible()
  await staffPage.screenshot({ path: shot('staff-ticket-detail', 'detail-closed-read-only'), fullPage: true })

  // 6. The closed ticket leaves the default queue but is found under "All".
  await staffPage.goto('/staff/queue')
  await staffPage.getByRole('searchbox', { name: /search tickets/i }).fill(ticketNumber)
  await staffPage.getByRole('button', { name: /^search$/i }).click()
  await expect(staffPage.getByText('No tickets match these filters.')).toBeVisible()
  await staffPage.getByLabel('Status').selectOption('all')
  await expect(staffPage.getByRole('row').filter({ hasText: ticketNumber })).toBeVisible()

  // The requester can no longer comment either.
  await requesterPage.reload()
  await expect(requesterPage.getByText('This ticket is closed. New comments are disabled.')).toBeVisible()
})

test('queue states and default view (screenshots)', async ({ page }) => {
  await signIn(page, staff)
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ path: shot('staff-queue', 'queue-default'), fullPage: true })

  await page.getByLabel('Sort').selectOption('itPriority:desc')
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ path: shot('staff-queue', 'queue-sorted-it-priority'), fullPage: true })

  await page.getByRole('searchbox', { name: /search tickets/i }).fill('zzz-nothing-matches-this')
  await page.getByRole('button', { name: /^search$/i }).click()
  await expect(page.getByText('No tickets match these filters.')).toBeVisible()
  await page.screenshot({ path: shot('staff-queue', 'queue-no-results'), fullPage: true })

  await page.route('**/api/staff/tickets?*', async (route) => {
    await new Promise((r) => setTimeout(r, 1200))
    await route.continue()
  })
  await page.goto('/staff/queue')
  await expect(page.getByRole('status').filter({ hasText: /loading tickets/i })).toBeVisible()
  await page.screenshot({ path: shot('staff-queue', 'queue-loading'), fullPage: true })
  await page.unroute('**/api/staff/tickets?*')

  await page.route('**/api/staff/tickets?*', (route) => route.fulfill({ status: 500, body: '{}' }))
  await page.goto('/staff/queue')
  await expect(page.getByRole('alert')).toContainText("couldn't load the ticket queue")
  await page.screenshot({ path: shot('staff-queue', 'queue-failure'), fullPage: true })
})
