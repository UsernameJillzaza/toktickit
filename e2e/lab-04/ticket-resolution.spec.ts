import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { apiAs, cleanupRun, closeApi, createTicket, createUser, disconnect, shot, signIn } from './support'
import type { E2EUser } from './support'

// E2E-02 (AC-17, 18, 20, 22, 24): the resolution gate and stale-update
// detection as a person meets them in the browser.

let requester: E2EUser
let staffA: E2EUser
let staffB: E2EUser

test.beforeAll(async () => {
  requester = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  staffA = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
  staffB = await createUser('IT_STAFF', 'Nok Staff', { ready: true })
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

/** A Ticket owned by staff A, In Progress, with the Actions asked for (through the real API). */
async function ticketWith(summary: string, actions: Array<'open' | 'completed'>) {
  const { id } = await createTicket(requester, summary)
  const api = await apiAs(staffA)
  await api.put(`/api/staff/tickets/${id}/owner`, { data: { ownerId: staffA.id } })
  const seen = await (await api.get(`/api/staff/tickets/${id}`)).json()
  expect((await api.put(`/api/staff/tickets/${id}/status`, { data: { status: 'IN_PROGRESS', expectedUpdatedAt: seen.updatedAt } })).status()).toBe(200)
  for (const [i, kind] of actions.entries()) {
    const made = await api.post(`/api/staff/tickets/${id}/actions`, { data: { requestKey: `res-${id}-${i}`, description: `Fixture action ${i + 1} (${kind})` } })
    expect(made.status()).toBe(201)
    if (kind === 'completed') {
      const action = await made.json()
      expect((await api.post(`/api/staff/tickets/${id}/actions/${action.id}/complete`, { data: { version: action.version, result: 'Done for the fixture' } })).status()).toBe(200)
    }
  }
  await closeApi(api)
  return id
}

async function openAs(browser: Browser, user: E2EUser, path: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await signIn(page, user)
  await page.goto(path)
  return page
}

const ops = (page: Page) => page.getByRole('region', { name: 'Operations' })
const pick = async (page: Page, label: string) => {
  await ops(page).getByLabel('Change status').selectOption({ label })
  await ops(page).getByRole('button', { name: 'Save status' }).click()
}
const confirm = (page: Page) => page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click()
const statusText = (page: Page) => ops(page).getByText('Status:').locator('..')

test('E2E-02 resolving is blocked by an Open Action, then allowed once it is completed', async ({ browser }) => {
  const id = await ticketWith('Gate: projector lamp flickers', ['open'])
  const page = await openAs(browser, staffA, `/staff/tickets/${id}`)
  await expect(ops(page)).toBeVisible()

  // The screen explains the rule before it is hit.
  await expect(ops(page).getByText('Resolved needs at least one completed action and no open actions.')).toBeVisible()
  await expect(ops(page).getByText('No action has been completed yet.')).toBeVisible()
  await expect(ops(page).getByText('1 action is still open.')).toBeVisible()

  // Blocked: the reasons appear next to the control and the choice stays.
  await pick(page, 'Resolved')
  await confirm(page)
  await expect(ops(page).getByText(/cannot be resolved yet/i)).toBeVisible()
  await expect(ops(page).getByLabel('Change status')).toHaveValue('RESOLVED')
  await expect(statusText(page)).toContainText('In Progress')
  await page.screenshot({ path: shot('actions-taken', 'resolution-blocked'), fullPage: true })

  // Complete the Action in the Actions area, then the same choice goes through.
  const region = page.getByRole('region', { name: /actions taken/i })
  await region.getByRole('button', { name: /^Complete action/ }).click()
  await region.getByLabel('Result').fill('Replaced the lamp')
  await region.getByRole('button', { name: 'Mark completed' }).click()
  await expect(region).toContainText('✓ Completed')
  await expect(ops(page).getByText('Resolved needs at least one completed action and no open actions.')).toHaveCount(0)

  await pick(page, 'Resolved')
  await confirm(page)
  await expect(statusText(page)).toContainText('Resolved')
  await expect(ops(page).getByLabel('Change status').locator('option', { hasText: 'Closed' })).toHaveCount(1) // options refreshed
  await expect(region.getByRole('button', { name: 'New action' })).toBeDisabled() // no more Actions on a Resolved ticket
  await expect(region.getByText('Reopen the ticket to add actions.')).toBeVisible()
})

test('E2E-02 a status change from a stale screen is refused and the user reloads', async ({ browser }) => {
  const id = await ticketWith('Stale: label printer jams', ['completed'])
  const page = await openAs(browser, staffA, `/staff/tickets/${id}`)
  await expect(ops(page)).toBeVisible()

  // Someone else comments on the ticket after this screen was loaded.
  const apiB = await apiAs(staffB)
  expect((await apiB.post(`/api/tickets/${id}/comments`, { data: { body: 'Sent the requester a question.' } })).status()).toBe(201)
  await closeApi(apiB)

  await pick(page, 'Waiting for Requester')
  await expect(ops(page).getByText('This ticket changed. Reload to continue.')).toBeVisible()
  await expect(ops(page).getByLabel('Change status')).toHaveValue('WAITING_FOR_REQUESTER') // choice kept
  await expect(statusText(page)).toContainText('In Progress') // nothing was changed
  await page.screenshot({ path: shot('actions-taken', 'status-stale-conflict'), fullPage: true })

  await ops(page).getByRole('button', { name: 'Reload' }).click()
  await expect(ops(page).getByText('This ticket changed. Reload to continue.')).toHaveCount(0)
  await expect(page.getByText('Sent the requester a question.')).toBeVisible() // the latest comment is on screen
  await ops(page).getByRole('button', { name: 'Save status' }).click()
  await expect(statusText(page)).toContainText('Waiting for Requester')
})

test('E2E-02 "Problem Appears Resolved" from the Requester does not resolve the Ticket', async ({ browser }) => {
  const id = await ticketWith('Advisory: monitor flickers', ['open'])
  const r = await openAs(browser, requester, `/tickets/${id}`)
  await r.getByRole('button', { name: 'Problem Appears Resolved' }).click()
  await expect(r.getByText(/you reported this problem as resolved on/i)).toBeVisible()

  const staff = await openAs(browser, staffA, `/staff/tickets/${id}`)
  await expect(staff.getByText(/the requester reported this problem as resolved/i)).toBeVisible()
  await expect(statusText(staff)).toContainText('In Progress') // only advice
  await pick(staff, 'Resolved')
  await confirm(staff)
  await expect(ops(staff).getByText(/cannot be resolved yet/i)).toBeVisible() // the gate still applies
  await expect(statusText(staff)).toContainText('In Progress')
})
