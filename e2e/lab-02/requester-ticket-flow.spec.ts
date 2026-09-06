import { test, expect } from '@playwright/test'

// Lab 2 §12 (e2e/lab-02/requester-ticket-flow.spec.ts) + §8.8 (Phase 8 UI
// polish): captures the 9 required screenshots — Create Ticket, My Tickets,
// and Ticket Detail, each at desktop/tablet/mobile — into
// artifacts/lab-02/screenshots/.
//
// Everything runs in ONE test (not one per screenshot) deliberately: each
// Playwright `test()` gets a fresh browser context by default, which would
// drop the selected-Requester `localStorage` value between tests. Keeping
// it all in one continuous test avoids needing `storageState` plumbing —
// found this the hard way when the first attempt split it into multiple
// tests and My Tickets/Ticket Detail failed with no requester selected.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 375, height: 812 },
] as const

test('capture Create Ticket, My Tickets, and Ticket Detail at all 3 breakpoints', async ({ page }) => {
  // Set up: select a requester, create one ticket to have real data to show.
  await page.goto('/select-requester')
  await page.getByLabel(/development requester/i).selectOption({ index: 1 })
  await page.getByRole('button', { name: /continue/i }).click()

  await page.goto('/create-ticket')
  await page.getByLabel(/category/i).selectOption({ index: 1 })
  await page.getByLabel(/related system/i).selectOption({ index: 1 })
  await page.getByLabel(/requested priority/i).selectOption('MEDIUM')
  await page.getByLabel(/^summary/i).fill('Screenshot fixture ticket for the responsive pass')
  await page
    .getByLabel(/^description/i)
    .fill('Created only so the UI-polish screenshots have real data to show.')
  await page.getByRole('button', { name: /submit/i }).click()
  await expect(page.getByText(/ticket created/i)).toBeVisible()

  let ticketDetailPath = ''

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)

    await page.goto('/create-ticket')
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/create-ticket/${viewport.name}.png`,
      fullPage: true,
    })

    await page.goto('/my-tickets')
    // The desktop table and mobile card render the same ticket text
    // simultaneously in the DOM (only one is display:none by breakpoint) —
    // `.first()` alone can resolve to the hidden one depending on viewport,
    // so filter to the actually-visible match explicitly.
    await expect(page.getByText(/screenshot fixture ticket/i).locator('visible=true').first()).toBeVisible()
    if (!ticketDetailPath) {
      const link = page.locator('a', { hasText: /^TKT-/ }).locator('visible=true').first()
      ticketDetailPath = new URL(await link.getAttribute('href')!, 'http://localhost').pathname
    }
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/my-tickets/${viewport.name}.png`,
      fullPage: true,
    })

    await page.goto(ticketDetailPath)
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/ticket-detail/${viewport.name}.png`,
      fullPage: true,
    })
  }
})
