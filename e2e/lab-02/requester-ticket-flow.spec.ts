import { test, expect } from '@playwright/test'
import { cleanupRun, createUser, disconnect, signIn } from '../lab-03/support'
import type { E2EUser } from '../lab-03/support'

// Lab 2 §12 requester flow — kept in Lab 3 as REG-03 (AC-12): Create Ticket,
// My Tickets and Ticket Detail must still work at all three breakpoints.
//
// Lab 3 changes: the Development Requester selector is gone (BR-42), so the
// flow signs in as a fresh, run-tagged requester instead of picking one.
// Screenshots now go to Playwright's per-test output folder (test-results/),
// NOT artifacts/lab-02/ — re-running Lab 3 must never overwrite the
// screenshots that were submitted as Lab 2 evidence.

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 375, height: 812 },
] as const

let requester: E2EUser

test.beforeAll(async () => {
  requester = await createUser('REQUESTER', 'Regression Requester', { ready: true })
})

test.afterAll(async () => {
  await cleanupRun()
  await disconnect()
})

test('REG-03 Create Ticket, My Tickets and Ticket Detail at all 3 breakpoints', async ({ page }, testInfo) => {
  await signIn(page, requester)

  await page.goto('/create-ticket')
  await page.getByLabel(/category/i).selectOption({ index: 1 })
  await page.getByLabel(/related system/i).selectOption({ index: 1 })
  await page.getByLabel(/requested priority/i).selectOption('MEDIUM')
  await page.getByLabel(/^summary/i).fill('Screenshot fixture ticket for the responsive pass')
  await page.getByLabel(/^description/i).fill('Created only so the regression screenshots have real data to show.')
  await page.getByRole('button', { name: /submit/i }).click()
  await expect(page.getByText(/ticket created/i)).toBeVisible()

  let ticketDetailPath = ''

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)

    await page.goto('/create-ticket')
    await expect(page.getByLabel(/^summary/i)).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`create-ticket-${viewport.name}.png`), fullPage: true })

    await page.goto('/my-tickets')
    // The desktop table and mobile card both exist in the DOM (one hidden by
    // breakpoint), so pick the visible match explicitly.
    await expect(page.getByText(/screenshot fixture ticket/i).locator('visible=true').first()).toBeVisible()
    if (!ticketDetailPath) {
      const link = page.locator('a', { hasText: /^TKT-/ }).locator('visible=true').first()
      ticketDetailPath = new URL((await link.getAttribute('href'))!, 'http://localhost').pathname
    }
    await page.screenshot({ path: testInfo.outputPath(`my-tickets-${viewport.name}.png`), fullPage: true })

    await page.goto(ticketDetailPath)
    await expect(page.getByText(/screenshot fixture ticket/i)).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`ticket-detail-${viewport.name}.png`), fullPage: true })
  }
})
