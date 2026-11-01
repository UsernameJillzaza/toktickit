import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { apiAs, cleanupRun, closeApi, createTicket, createUser, disconnect, expectNoHorizontalOverflow, shot, signIn, VIEWPORTS } from './support'
import type { E2EUser } from './support'

// RESP-01 (AC-40): the dashboards and the ticket screens with Actions Taken at
// desktop / tablet / mobile. Asserted, not just photographed: no horizontal
// overflow, every visible button at least 44 px tall on mobile (including the
// open forms and panels), and a visible keyboard focus ring on the new forms.

let requester: E2EUser
let staff: E2EUser
let admin: E2EUser
let ticketId: number

test.beforeAll(async () => {
  requester = await createUser('REQUESTER', 'Ploy Requester', { ready: true })
  staff = await createUser('IT_STAFF', 'Krit Staff', { ready: true })
  admin = await createUser('ADMIN', 'Mali Admin', { ready: true })
  ticketId = (await createTicket(requester, 'Shared drive mapping disappears after every restart with a long summary that has to wrap', 'HIGH')).id
  const api = await apiAs(staff)
  await api.put(`/api/staff/tickets/${ticketId}/owner`, { data: { ownerId: staff.id } })
  for (const [i, kind] of (['completed', 'open'] as const).entries()) {
    const made = await api.post(`/api/staff/tickets/${ticketId}/actions`, {
      data: { requestKey: `resp-${ticketId}-${i}`, description: `A long action description (${kind}) that has to wrap onto several lines on a narrow phone screen without clipping`, followUpRequired: true, followUpNote: 'A follow-up note that is also long enough to wrap on mobile' },
    })
    expect(made.status()).toBe(201)
    if (kind === 'completed') {
      const action = await made.json()
      await api.post(`/api/staff/tickets/${ticketId}/actions/${action.id}/complete`, { data: { version: action.version, result: 'Remapped through group policy' } })
    }
  }
  await closeApi(api)
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

async function pageAs(browser: Browser, user: E2EUser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await signIn(page, user)
  return page
}

type Screen = { folder: string; name: string; who: () => E2EUser; path: () => string; ready: (page: Page) => Promise<unknown> }

const SCREENS: Screen[] = [
  { folder: 'requester-dashboard', name: 'resp-requester-dashboard', who: () => requester, path: () => '/dashboard', ready: (p) => expect(p.getByRole('group', { name: 'Open tickets' })).toBeVisible() },
  { folder: 'staff-dashboard', name: 'resp-staff-dashboard', who: () => staff, path: () => '/dashboard', ready: (p) => expect(p.getByRole('group', { name: 'Unassigned' })).toBeVisible() },
  { folder: 'staff-dashboard', name: 'resp-admin-dashboard', who: () => admin, path: () => '/dashboard', ready: (p) => expect(p.getByRole('group', { name: 'Users' })).toBeVisible() },
  { folder: 'actions-taken', name: 'resp-staff-detail', who: () => staff, path: () => `/staff/tickets/${ticketId}`, ready: (p) => expect(p.getByRole('region', { name: /actions taken/i }).getByRole('listitem')).toHaveCount(2) },
  { folder: 'actions-taken', name: 'resp-requester-detail', who: () => requester, path: () => `/tickets/${ticketId}`, ready: (p) => expect(p.getByRole('region', { name: 'Work done on your ticket' }).getByRole('listitem')).toHaveCount(2) },
]

for (const screen of SCREENS) {
  test(`RESP-01 ${screen.name} at 1280 / 820 / 375 px has no horizontal overflow`, async ({ browser }) => {
    const page = await pageAs(browser, screen.who())
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(screen.path())
      await screen.ready(page)
      await page.waitForLoadState('networkidle')
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: shot(screen.folder, `${screen.name}-${vp.name}`), fullPage: true })
    }
  })
}

const shortButtons = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button, a.btn')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((b) => b.h < 44),
  )

// ui-spec §9: every button is at least 44 px tall on mobile, with the forms and panels open too.
test('RESP-01 mobile buttons are at least 44px tall, including the open forms and panels', async ({ browser }) => {
  for (const [user, path] of [
    [requester, '/dashboard'],
    [staff, '/dashboard'],
    [admin, '/dashboard'],
    [requester, `/tickets/${ticketId}`],
  ] as const) {
    const page = await pageAs(browser, user)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await shortButtons(page), `buttons under 44px on ${path} as ${user.role}`).toEqual([])
  }

  const page = await pageAs(browser, staff)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`/staff/tickets/${ticketId}`)
  const region = page.getByRole('region', { name: /actions taken/i })
  await expect(region.getByRole('listitem')).toHaveCount(2)
  expect(await shortButtons(page), 'staff detail with the list').toEqual([])

  await region.getByRole('button', { name: 'New action' }).click()
  await expect(page.getByRole('form', { name: 'Save action' })).toBeVisible()
  expect(await shortButtons(page), 'create form open').toEqual([])
  await page.screenshot({ path: shot('actions-taken', 'create-form-mobile'), fullPage: true })
  await page.getByRole('form', { name: 'Save action' }).getByRole('button', { name: 'Cancel' }).click()

  await region.getByRole('button', { name: /^Edit action/ }).click()
  expect(await shortButtons(page), 'edit form open').toEqual([])
  await page.getByRole('form', { name: 'Save changes' }).getByRole('button', { name: 'Cancel' }).click()

  await region.getByRole('button', { name: /^Complete action/ }).click()
  expect(await shortButtons(page), 'complete panel open').toEqual([])
  await page.screenshot({ path: shot('actions-taken', 'complete-mobile'), fullPage: true })
})

// ui-spec §10: keyboard focus is visible on every control of the new forms.
// The way a keyboard user gets there: activate "New action", then Tab through the form.
test('RESP-01 keyboard focus is visible on every control of the Action form', async ({ browser }) => {
  const page = await pageAs(browser, staff)
  await page.goto(`/staff/tickets/${ticketId}`)
  const region = page.getByRole('region', { name: /actions taken/i })
  await expect(region.getByRole('listitem')).toHaveCount(2)
  await region.getByRole('button', { name: 'New action' }).focus()
  await page.keyboard.press('Enter') // opens the form, as a keyboard user would
  await expect(page.getByRole('form', { name: 'Save action' })).toBeVisible()

  // A date-time field has several segments (day, month, year, hour, minute), so one
  // control can take several Tab presses. Sample after each press, judge the ring
  // whenever the control really holds focus, and require at least one such sample per control.
  const sample = async () => {
    await page.waitForTimeout(250) // Bootstrap fades the ring in over 150 ms
    return page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement
      const s = getComputedStyle(el)
      return {
        type: el.type,
        name: el.id || (el.textContent ?? '').trim(),
        inForm: Boolean(el.closest('form')),
        focused: el.matches(':focus'),
        visible: s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && s.outlineWidth !== '0px'),
      }
    })
  }

  const order: string[] = []
  const withRing = new Set<string>()
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    const r = await sample()
    if (!r.inForm) break
    if (!order.includes(r.name)) order.push(r.name)
    if (r.focused) {
      expect(r.visible, `focus ring on ${r.name}`).toBe(true)
      withRing.add(r.name)
    }
    if (r.type === 'checkbox' && r.focused) await page.keyboard.press('Space') // ticking it adds the follow-up note field
    if (r.name === 'new-action-description' && r.focused) await page.screenshot({ path: shot('actions-taken', 'keyboard-focus'), fullPage: true })
  }
  expect(order).toEqual([
    'new-action-actionAt',
    'new-action-performedById',
    'new-action-description',
    'new-action-followUpRequired',
    'new-action-followUpNote',
    'new-action-attachmentNotes',
    'Save action',
    'Cancel',
  ])
  expect([...withRing].sort(), 'every control showed a ring at least once').toEqual([...order].sort())
})
