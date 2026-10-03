import { test, expect } from '@playwright/test'
import path from 'node:path'

// Lab 2 §14 submission evidence — captures the remaining screen states
// required by Part 6/7/8 (and the Dev Requester selector's loading/failure
// states for Part 6) as real PNGs, plus two direct-API 404 evidence shots.
// Run with: npx playwright test e2e/lab-02/submission-evidence.spec.ts
// (server + client must already be running — see e2e/lab-02/README or the
// existing requester-ticket-flow.spec.ts for the same prerequisite.)

const OUT = 'artifacts/lab-02/manual-evidence'
const VALID_FILE = path.join(__dirname, 'fixtures/valid-attachment.png')
const INVALID_FILE = path.join(__dirname, 'fixtures/invalid-attachment.txt')

// Requester A = Jennifer Anderson (id 1, has existing tickets)
// Requester B = Michael Brown (id 2, zero tickets — proves cross-requester isolation + empty state)
// Requester D = Nattaya Chaiyaporn (id 4, seeded here with 12 tickets for pagination)
const REQUESTER_A = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' }
const REQUESTER_B = { id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test' }
const REQUESTER_PAGINATION = { id: 4, name: 'Nattaya Chaiyaporn', email: 'nattaya.chaiyaporn@toktickit.test' }

async function selectRequesterViaStorage(page: import('@playwright/test').Page, requester: typeof REQUESTER_A) {
  await page.addInitScript((r) => {
    window.localStorage.setItem('toktickit.selectedRequester', JSON.stringify(r))
  }, requester)
}

test('Dev Requester Selection: dropdown, loading, failure', async ({ page }) => {
  await page.goto('/select-requester')
  await expect(page.getByLabel(/development requester/i)).toBeVisible()
  await page.screenshot({ path: `${OUT}/dev-requester-select-dropdown.png`, fullPage: true })

  // Loading state: delay the requesters response so the spinner text is caught on screen.
  await page.route('**/api/requesters', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })
  await page.goto('/select-requester')
  await expect(page.getByText(/loading requesters/i)).toBeVisible()
  await page.screenshot({ path: `${OUT}/dev-requester-select-loading.png`, fullPage: true })
  await page.unroute('**/api/requesters')

  // Failure state.
  await page.route('**/api/requesters', (route) => route.fulfill({ status: 500, body: '{}' }))
  await page.goto('/select-requester')
  await expect(page.getByText(/unable to load development requesters/i)).toBeVisible()
  await page.screenshot({ path: `${OUT}/dev-requester-select-failure.png`, fullPage: true })
  await page.unroute('**/api/requesters')
})

test('App shell shows selected Requester + Change Requester', async ({ page }) => {
  await selectRequesterViaStorage(page, REQUESTER_A)
  await page.goto('/')
  await expect(page.getByText(REQUESTER_A.name)).toBeVisible()
  await expect(page.getByRole('button', { name: /change requester/i })).toBeVisible()
  await page.screenshot({ path: `${OUT}/app-shell-selected-requester.png`, fullPage: true })
})

test('Create Ticket: initial, validation failure, submitting, success, API failure', async ({ page }) => {
  await selectRequesterViaStorage(page, REQUESTER_A)

  await page.goto('/create-ticket')
  await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible()
  await page.screenshot({ path: `${OUT}/create-ticket-initial.png`, fullPage: true })

  // Validation failure: submit with everything empty.
  await page.getByRole('button', { name: /submit/i }).click()
  await expect(page.locator('.invalid-feedback', { hasText: /select a category/i })).toBeVisible()
  await page.screenshot({ path: `${OUT}/create-ticket-validation-failure.png`, fullPage: true })

  // Fill a valid form for the remaining states.
  await page.getByLabel(/category/i).selectOption({ index: 1 })
  await page.getByLabel(/related system/i).selectOption({ index: 1 })
  await page.getByLabel(/requested priority/i).selectOption('MEDIUM')
  await page.getByLabel(/^summary/i).fill('Submission-evidence ticket for Part 6 screenshots')
  await page.getByLabel(/^description/i).fill('Created only to capture the Create Ticket screen states for Lab 2 submission evidence.')

  // Submitting state: delay the POST so the disabled/busy button is caught on screen.
  await page.route('**/api/tickets', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((r) => setTimeout(r, 1200))
    }
    await route.continue()
  })
  await page.getByRole('button', { name: /submit/i }).click()
  await expect(page.getByRole('button', { name: /submitting/i })).toBeVisible()
  await page.screenshot({ path: `${OUT}/create-ticket-submitting.png`, fullPage: true })
  await expect(page.getByText(/ticket created/i)).toBeVisible({ timeout: 5000 })
  await page.screenshot({ path: `${OUT}/create-ticket-success.png`, fullPage: true })
  await page.unroute('**/api/tickets')

  // API failure state: same valid form, but POST now fails server-side.
  await page.route('**/api/tickets', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated server error' }) })
    }
    return route.continue()
  })
  await page.goto('/create-ticket')
  await page.getByLabel(/category/i).selectOption({ index: 1 })
  await page.getByLabel(/related system/i).selectOption({ index: 1 })
  await page.getByLabel(/requested priority/i).selectOption('HIGH')
  await page.getByLabel(/^summary/i).fill('This submission should fail against a simulated API error')
  await page.getByLabel(/^description/i).fill('Form values must survive the failed submission per BR-11.')
  await page.getByRole('button', { name: /submit/i }).click()
  await expect(page.getByText(/simulated server error/i)).toBeVisible()
  await expect(page.getByLabel(/^summary/i)).toHaveValue(/should fail/i)
  await page.screenshot({ path: `${OUT}/create-ticket-api-failure.png`, fullPage: true })
  await page.unroute('**/api/tickets')
})

test('Ticket Detail: owned view, valid/invalid attachment, soft-remove, blocked download', async ({ page, request }) => {
  await selectRequesterViaStorage(page, REQUESTER_A)

  // Create a fresh ticket via the real API to attach files to.
  const created = await request.post('http://localhost:3000/api/tickets', {
    data: {
      requesterId: REQUESTER_A.id,
      categoryId: 1,
      relatedSystemId: 1,
      summary: 'Ticket Detail submission-evidence fixture',
      description: 'Used to capture Part 8 attachment screenshots.',
      requestedPriority: 'LOW',
    },
  })
  const ticket = await created.json()

  await page.goto(`/tickets/${ticket.id}`)
  await expect(page.getByRole('heading', { name: /ticket detail/i })).toBeVisible()
  await page.screenshot({ path: `${OUT}/ticket-detail-owned.png`, fullPage: true })

  // Invalid attachment: rejected client/server-side (wrong MIME type).
  await page.locator('#attachment-upload').setInputFiles(INVALID_FILE)
  await expect(page.getByRole('alert')).toBeVisible()
  await page.screenshot({ path: `${OUT}/attachment-invalid-rejected.png`, fullPage: true })

  // Valid attachment: accepted.
  await page.locator('#attachment-upload').setInputFiles(VALID_FILE)
  await expect(page.getByText(/valid-attachment\.png/i)).toBeVisible()
  await page.screenshot({ path: `${OUT}/attachment-valid-added.png`, fullPage: true })

  // Soft-remove with a reason >= 5 chars: Confirm becomes enabled.
  await page.getByRole('button', { name: /^remove$/i }).click()
  await page.getByLabel(/removal reason/i).fill('No longer needed')
  await expect(page.getByRole('button', { name: /^confirm$/i })).toBeEnabled()
  await page.screenshot({ path: `${OUT}/attachment-soft-remove-confirm-enabled.png`, fullPage: true })
  await page.getByRole('button', { name: /^confirm$/i }).click()

  // After removal: metadata still shown, marked Removed, Download disabled — one screenshot covers both.
  await expect(page.getByText(/removed/i)).toBeVisible()
  await page.screenshot({ path: `${OUT}/attachment-removed-download-blocked.png`, fullPage: true })
})

test('My Tickets: per-requester isolation, search, sort, empty, no-results', async ({ page, request }) => {
  // Requester A: has existing tickets.
  await selectRequesterViaStorage(page, REQUESTER_A)
  await page.goto('/my-tickets')
  await expect(page.getByRole('heading', { name: /my tickets/i })).toBeVisible()
  await expect(page.getByText(/loading tickets/i)).not.toBeVisible()
  await page.screenshot({ path: `${OUT}/my-tickets-requesterA.png`, fullPage: true })
  const aTicketNumbers = await page.locator('a', { hasText: /^TKT-/ }).allTextContents()

  // Search: match one of Requester A's own tickets.
  if (aTicketNumbers.length > 0) {
    await page.getByLabel(/search tickets/i).fill(aTicketNumbers[0])
    await page.getByRole('button', { name: /^search$/i }).click()
    await expect(page.getByText(aTicketNumbers[0]).locator('visible=true').first()).toBeVisible()
    await page.screenshot({ path: `${OUT}/my-tickets-search.png`, fullPage: true })
  }

  // No-results: search for nonsense.
  await page.getByLabel(/search tickets/i).fill('zzz-no-such-ticket-zzz')
  await page.getByRole('button', { name: /^search$/i }).click()
  await expect(page.getByText(/no tickets match your search/i)).toBeVisible()
  await page.screenshot({ path: `${OUT}/my-tickets-no-results.png`, fullPage: true })

  // Sort: switch to Oldest first (clear the search first).
  await page.getByRole('button', { name: /clear filters/i }).click()
  await page.getByLabel(/sort tickets/i).selectOption('createdAt:asc')
  await expect(page.getByText(/loading tickets/i)).not.toBeVisible()
  await page.screenshot({ path: `${OUT}/my-tickets-sort.png`, fullPage: true })

  // Requester B: zero tickets — empty state, and proof A's ticket is gone.
  // `addInitScript` (not `page.evaluate` before `goto`) because it's
  // guaranteed to run before the app's own boot script on the *next*
  // navigation — a plain evaluate-then-goto raced the reload and the app
  // sometimes still read the old Requester from localStorage.
  await selectRequesterViaStorage(page, REQUESTER_B)
  await page.goto('/my-tickets')
  await expect(page.getByText(/haven't created any tickets/i)).toBeVisible()
  if (aTicketNumbers.length > 0) {
    await expect(page.getByText(aTicketNumbers[0])).not.toBeVisible()
  }
  await page.screenshot({ path: `${OUT}/my-tickets-requesterB-empty.png`, fullPage: true })

  // Pagination: seed 12 tickets for Requester D (PAGE_SIZE is 10).
  for (let i = 0; i < 12; i++) {
    await request.post('http://localhost:3000/api/tickets', {
      data: {
        requesterId: REQUESTER_PAGINATION.id,
        categoryId: 1,
        relatedSystemId: 1,
        summary: `Pagination fixture ticket #${i + 1}`,
        description: 'Seeded only to demonstrate multi-page My Tickets pagination.',
        requestedPriority: 'LOW',
      },
    })
  }
  await selectRequesterViaStorage(page, REQUESTER_PAGINATION)
  await page.goto('/my-tickets')
  // Re-running this spec re-seeds 12 more each time, so don't assume the
  // page count is exactly 2 — only that there's more than one page.
  await expect(page.getByText(/page 1 of [2-9]/i)).toBeVisible()
  await page.screenshot({ path: `${OUT}/my-tickets-pagination.png`, fullPage: true })
})

test('Cross-requester 404 evidence: ticket and attachment', async ({ page, request }) => {
  // Requester A owns this ticket; Requester B (id 2) must get 404 for both endpoints.
  const created = await request.post('http://localhost:3000/api/tickets', {
    data: {
      requesterId: REQUESTER_A.id,
      categoryId: 1,
      relatedSystemId: 1,
      summary: 'Cross-requester 404 evidence fixture',
      description: 'Owned by Requester A only; Requester B must never see this.',
      requestedPriority: 'LOW',
    },
  })
  const ticket = await created.json()

  const uploaded = await request.post(
    `http://localhost:3000/api/tickets/${ticket.id}/attachments?requesterId=${REQUESTER_A.id}`,
    { multipart: { file: { name: 'evidence.png', mimeType: 'image/png', buffer: require('node:fs').readFileSync(VALID_FILE) } } },
  )
  const attachment = await uploaded.json()

  // Navigate the browser directly to the wrong-owner URLs — both are plain
  // GETs keyed by a `requesterId` query param, so the raw JSON response
  // renders straight in the page; no dev-tools Network panel needed.
  await page.goto(`http://localhost:3000/api/tickets/${ticket.id}?requesterId=${REQUESTER_B.id}`)
  await expect(page.locator('body')).toContainText(/not.?found/i)
  await page.screenshot({ path: `${OUT}/cross-requester-ticket-404.png`, fullPage: true })

  await page.goto(`http://localhost:3000/api/attachments/${attachment.id}/download?requesterId=${REQUESTER_B.id}`)
  await expect(page.locator('body')).toContainText(/not.?found/i)
  await page.screenshot({ path: `${OUT}/cross-requester-attachment-404.png`, fullPage: true })
})
