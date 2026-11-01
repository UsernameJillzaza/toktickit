import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { apiAs, cleanupRun, closeApi, createTicket, createUser, disconnect, expectNoHorizontalOverflow, prisma, shot, signIn } from './support'
import type { E2EUser } from './support'

// E2E-01 (AC-01, 05, 07, 08, 11, 14, 36): two IT Staff members record different
// Actions on one Ticket, edit, complete and cancel them in the real browser,
// the Requester sees the result read-only, and the failures a user can hit
// (empty form, a stale edit, a performer who has just been deactivated) are
// shown next to the control that caused them. Captures actions-taken/ evidence.

let requester: E2EUser
let staffA: E2EUser
let staffB: E2EUser
let staffC: E2EUser
let ticketId: number

const FIRST = 'Replaced the HDMI switcher in room 401'
const FIRST_EDITED = 'Replaced the HDMI switcher and the wall plate in room 401'
const SECOND = 'Checked the projector firmware'
const SECRET_NOTE = 'Internal only: the switcher was already flagged last month.'

test.beforeAll(async () => {
  requester = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  staffA = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
  staffB = await createUser('IT_STAFF', 'Nok Staff', { ready: true })
  staffC = await createUser('IT_STAFF', 'Pim Staff', { ready: true })
  ticketId = (await createTicket(requester, 'Projector in room 401 shows no signal', 'HIGH')).id
  const api = await apiAs(staffA)
  await api.put(`/api/staff/tickets/${ticketId}/owner`, { data: { ownerId: staffA.id } })
  expect((await api.post(`/api/staff/tickets/${ticketId}/notes`, { data: { body: SECRET_NOTE } })).status()).toBe(201)
  await closeApi(api)
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

async function staffPage(browser: Browser, user: E2EUser): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await signIn(page, user)
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(page.getByRole('region', { name: /actions taken/i })).toBeVisible()
  return page
}

const region = (page: Page) => page.getByRole('region', { name: /actions taken/i })
const card = (page: Page, text: string) => region(page).getByRole('listitem').filter({ hasText: text })

async function createAction(page: Page, description: string, extra: { followUp?: string; attachment?: string } = {}) {
  await region(page).getByRole('button', { name: 'New action' }).click()
  const form = page.getByRole('form', { name: 'Save action' })
  await form.getByLabel('Description').fill(description)
  if (extra.followUp) {
    await form.getByLabel('Follow-up required').check()
    await form.getByLabel('Follow-up note').fill(extra.followUp)
  }
  if (extra.attachment) await form.getByLabel('Attachment notes').fill(extra.attachment)
  await form.getByRole('button', { name: 'Save action' }).click()
  await expect(card(page, description)).toBeVisible()
}

test('E2E-01 two staff record, edit, complete and cancel Actions; the Requester sees them read-only', async ({ browser }) => {
  const a = await staffPage(browser, staffA)
  const b = await staffPage(browser, staffB)

  // 1. The empty state, then the create form and its validation.
  await expect(region(a).getByText('No actions taken yet.')).toBeVisible()
  await shot_(a, 'list-empty')
  await region(a).getByRole('button', { name: 'New action' }).click()
  const form = a.getByRole('form', { name: 'Save action' })
  await expect(form.getByLabel('Performed by')).toHaveValue(String(staffA.id)) // defaults to me
  await shot_(a, 'create-form')
  await form.getByRole('button', { name: 'Save action' }).click()
  await expect(form.getByText('Description is required.')).toBeVisible()
  await expect(form.getByLabel('Description')).toBeFocused()
  await expect(form.getByLabel('Description')).toHaveAttribute('aria-invalid', 'true')
  await shot_(a, 'create-validation')
  await form.getByRole('button', { name: 'Cancel' }).click()

  // 2. Staff A records an Action with a follow-up; staff B records a different one.
  await createAction(a, FIRST, { followUp: 'Look at the projector again on Monday', attachment: 'Photo in folder 401' })
  await expect(card(a, FIRST)).toContainText('Krit Staff')
  await expect(card(a, FIRST)).toContainText('! Follow-up needed')
  await expect(card(a, FIRST)).toContainText('Follow-up: Look at the projector again on Monday')
  await expect(card(a, FIRST)).toContainText('Attachment notes: Photo in folder 401')

  await b.reload()
  await expect(card(b, FIRST)).toBeVisible() // B sees A's Action
  await expect(region(b).getByRole('button', { name: 'New action' }).locator('..')).toBeVisible()
  await createAction(b, SECOND)
  await expect(card(b, SECOND)).toContainText('Nok Staff')

  await a.reload()
  await expect(card(a, SECOND)).toContainText('Nok Staff')
  await expect(card(a, FIRST)).toContainText('Krit Staff')
  await shot_(a, 'different-performers')

  // 3. Edit (the Ticket's Last Updated moves, so the status control stays usable after a reload).
  await card(a, FIRST).getByRole('button', { name: /^Edit action/ }).click()
  const edit = a.getByRole('form', { name: 'Save changes' })
  await edit.getByLabel('Description').fill(FIRST_EDITED)
  await shot_(a, 'edit')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(card(a, FIRST_EDITED)).toBeVisible()

  // 4. A stale edit: A opens the form, B changes the same Action, A saves.
  await card(a, FIRST_EDITED).getByRole('button', { name: /^Edit action/ }).click()
  const staleForm = a.getByRole('form', { name: 'Save changes' })
  await staleForm.getByLabel('Description').fill('Wording that A typed and has not saved yet')
  const apiB = await apiAs(staffB)
  const listed = await (await apiB.get(`/api/staff/tickets/${ticketId}/actions`)).json()
  const firstAction = listed.actions.find((x: { description: string }) => x.description === FIRST_EDITED)
  const patched = await apiB.patch(`/api/staff/tickets/${ticketId}/actions/${firstAction.id}`, {
    data: { version: firstAction.version, description: 'Wording that B saved first' },
  })
  expect(patched.status()).toBe(200)
  await closeApi(apiB)
  await staleForm.getByRole('button', { name: 'Save changes' }).click()
  await expect(staleForm.getByRole('alert')).toContainText('This action was changed by someone else. Reload to see the latest.')
  await expect(staleForm.getByLabel('Description')).toHaveValue('Wording that A typed and has not saved yet') // nothing lost yet
  await shot_(a, 'stale-conflict')
  await staleForm.getByRole('button', { name: 'Reload' }).click()
  await expect(a.getByRole('form', { name: 'Save changes' })).toHaveCount(0)
  await expect(card(a, 'Wording that B saved first')).toBeVisible()

  // 5. Complete A's Action; Completed shows its result and no buttons.
  await card(a, 'Wording that B saved first').getByRole('button', { name: /^Complete action/ }).click()
  const complete = a.getByRole('form', { name: 'Mark completed' })
  await expect(complete.getByLabel('Result')).toBeFocused()
  await complete.getByRole('button', { name: 'Mark completed' }).click()
  await expect(complete.getByText('Result is required.')).toBeVisible()
  await complete.getByLabel('Result').fill('The picture is back on every laptop')
  await shot_(a, 'complete')
  await complete.getByRole('button', { name: 'Mark completed' }).click()
  const done = card(a, 'Wording that B saved first')
  await expect(done).toContainText('✓ Completed')
  await expect(done).toContainText('Result: The picture is back on every laptop')
  await expect(done.getByRole('button')).toHaveCount(0)

  // 6. Cancel B's Action with a reason.
  await b.reload()
  await card(b, SECOND).getByRole('button', { name: /^Cancel action/ }).click()
  const cancel = b.getByRole('form', { name: 'Cancel action' })
  await cancel.getByLabel('Reason').fill('The firmware was already current')
  await shot_(b, 'cancel')
  await cancel.getByRole('button', { name: 'Cancel action' }).click()
  const cancelled = card(b, SECOND)
  await expect(cancelled).toContainText('✕ Cancelled')
  await expect(cancelled).toContainText('Reason: The firmware was already current')
  await expect(cancelled.getByRole('button')).toHaveCount(0)

  // 7. A performer deactivated while the form is open is refused next to the select.
  await a.reload()
  await region(a).getByRole('button', { name: 'New action' }).click()
  const late = a.getByRole('form', { name: 'Save action' })
  await late.getByLabel('Description').fill('Handed the follow-up to Pim')
  await late.getByLabel('Performed by').selectOption({ label: 'Pim Staff' })
  await prisma.user.update({ where: { id: staffC.id }, data: { isActive: false } }) // fixture: deactivated by an admin meanwhile
  await late.getByRole('button', { name: 'Save action' }).click()
  await expect(late.getByLabel('Performed by')).toHaveAttribute('aria-invalid', 'true')
  await expect(late.getByLabel('Performed by')).toBeFocused()
  await expect(late.locator('#new-action-performedById-error')).toBeVisible()
  await expect(late.getByLabel('Description')).toHaveValue('Handed the follow-up to Pim') // typed text kept
  await shot_(a, 'inactive-performer-rejected')

  // 8. Responsive layouts of the list on tablet and mobile.
  await late.getByRole('button', { name: 'Cancel' }).click()
  await a.reload()
  for (const [name, width, height] of [['tablet', 820, 1180], ['mobile', 375, 812]] as const) {
    await a.setViewportSize({ width, height })
    await expect(region(a)).toBeVisible()
    await expectNoHorizontalOverflow(a)
    await region(a).scrollIntoViewIfNeeded()
    await a.screenshot({ path: shot('actions-taken', `list-${name}`), fullPage: true })
  }

  // 9. The Requester sees the work, read-only, and never the Internal Note.
  const r = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await signIn(r, requester)
  await r.goto(`/tickets/${ticketId}`)
  const work = r.getByRole('region', { name: 'Work done on your ticket' })
  await expect(work.getByRole('listitem')).toHaveCount(2)
  await expect(work).toContainText('Wording that B saved first')
  await expect(work).toContainText('✓ Completed')
  await expect(work).toContainText('Result: The picture is back on every laptop')
  await expect(work).toContainText('✕ Cancelled')
  await expect(work.getByRole('button')).toHaveCount(0)
  await expect(r.getByText(SECRET_NOTE)).toHaveCount(0)
  await expect(r.getByRole('button', { name: 'New action' })).toHaveCount(0)
  await r.screenshot({ path: shot('actions-taken', 'requester-read-only'), fullPage: true })
})

/** Full-page screenshot of the staff screen into actions-taken/. */
async function shot_(page: Page, name: string) {
  await page.screenshot({ path: shot('actions-taken', name), fullPage: true })
}
