import { test, expect } from '@playwright/test'

// Lab 2 §12 (e2e/lab-02/requester-ticket-flow.spec.ts) + §8.8 (Phase 8 UI
// polish): captures the 9 required screenshots — Create Ticket, My Tickets,
// and Ticket Detail, each at desktop/tablet/mobile — into
// artifacts/lab-02/screenshots/.
//
// NOTE for whoever runs this: it needs `server` (port 3000, seeded via
// `npx prisma db seed`) and `client` (port 5173) already running in two
// other terminals. This file could not be executed in the sandboxed
// environment this Issue was implemented in — the Playwright browser
// binary download timed out against a network restriction that also
// blocked a mirror host, confirmed not a transient blip by retrying
// several times. It's included so it can run wherever that isn't blocked
// (e.g. the student's own machine) — see Lab2_Guidance / the PR
// description for what was verified manually in its place.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 375, height: 812 },
] as const

test.describe.configure({ mode: 'serial' })

let ticketDetailPath = ''

test('select a requester and create a ticket to have something to screenshot', async ({ page }) => {
  await page.goto('/select-requester')
  await page.getByLabel(/development requester/i).selectOption({ index: 1 })
  await page.getByRole('button', { name: /continue/i }).click()

  await page.goto('/create-ticket')
  await page.getByLabel(/category/i).selectOption({ index: 1 })
  await page.getByLabel(/related system/i).selectOption({ index: 1 })
  await page.getByLabel(/requested priority/i).selectOption('MEDIUM')
  await page.getByLabel(/^summary/i).fill('Screenshot fixture ticket for the responsive pass')
  await page.getByLabel(/^description/i).fill('Created only so the UI-polish screenshots have real data to show.')
  await page.getByRole('button', { name: /submit/i }).click()

  await expect(page.getByText(/ticket created/i)).toBeVisible()
})

for (const viewport of VIEWPORTS) {
  test(`Create Ticket screenshot — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/create-ticket')
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/create-ticket/${viewport.name}.png`,
      fullPage: true,
    })
  })

  test(`My Tickets screenshot — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/my-tickets')
    await expect(page.getByText(/screenshot fixture ticket/i).first()).toBeVisible()

    if (viewport.name === 'desktop') {
      const link = page.locator('table a', { hasText: /^TKT-/ }).first()
      ticketDetailPath = new URL(await link.getAttribute('href')!, 'http://localhost').pathname
    }

    await page.screenshot({
      path: `artifacts/lab-02/screenshots/my-tickets/${viewport.name}.png`,
      fullPage: true,
    })
  })

  test(`Ticket Detail screenshot — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto(ticketDetailPath || '/my-tickets')
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/ticket-detail/${viewport.name}.png`,
      fullPage: true,
    })
  })
}
