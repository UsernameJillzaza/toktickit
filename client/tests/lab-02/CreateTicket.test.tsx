import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateTicket from '../../src/tickets/CreateTicket'
import { RequesterProvider } from '../../src/requester/RequesterContext'

const CATEGORIES = [{ id: 1, name: 'Hardware' }]
const RELATED_SYSTEMS = [{ id: 1, name: 'Corporate Laptop' }]
const REQUESTER = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' }

function mockFetch(handlers: {
  onTicketPost?: () => { ok: boolean; status: number; body: unknown }
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/categories')) {
        return { ok: true, status: 200, json: async () => CATEGORIES }
      }
      if (url.includes('/api/related-systems')) {
        return { ok: true, status: 200, json: async () => RELATED_SYSTEMS }
      }
      if (url.includes('/api/tickets') && init?.method === 'POST') {
        const result = handlers.onTicketPost?.() ?? { ok: true, status: 201, body: {} }
        return { ok: result.ok, status: result.status, json: async () => result.body }
      }
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
}

function renderCreateTicket() {
  return render(
    <RequesterProvider>
      <CreateTicket />
    </RequesterProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.setItem('toktickit.selectedRequester', JSON.stringify(REQUESTER))
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

async function fillValidForm() {
  await userEvent.selectOptions(screen.getByLabelText(/category/i), 'Hardware')
  await userEvent.selectOptions(screen.getByLabelText(/related system/i), 'Corporate Laptop')
  await userEvent.selectOptions(screen.getByLabelText(/requested priority/i), 'MEDIUM')
  await userEvent.type(screen.getByLabelText(/^summary/i), 'Laptop battery drains quickly')
  await userEvent.type(
    screen.getByLabelText(/^description/i),
    'The battery goes from 100% to 20% within an hour of normal use.',
  )
}

// UI-04 (AC-04): submitting with an empty Summary shows a field-level error
// and does not call the API.
describe('UI-04 validation failure', () => {
  it('shows a field error under Summary and does not submit', async () => {
    mockFetch({})
    renderCreateTicket()

    await screen.findByLabelText(/category/i)
    const postSpy = vi.fn()
    // fillValidForm skipped on purpose — leave Summary/Description empty.
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'Hardware')
    await userEvent.selectOptions(screen.getByLabelText(/related system/i), 'Corporate Laptop')
    await userEvent.selectOptions(screen.getByLabelText(/requested priority/i), 'MEDIUM')

    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/summary must be 10-150 characters/i)).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })
})

// UI-03 (BR-10): the Submit button disables immediately on click and does
// not allow a second submission while the first is in flight.
describe('UI-03 double-submit prevention', () => {
  it('disables Submit while the request is pending', async () => {
    let resolvePost!: () => void
    // A controllable pending promise, so we can assert the disabled state
    // before letting the request "complete".
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/categories')) return { ok: true, status: 200, json: async () => CATEGORIES }
        if (url.includes('/api/related-systems'))
          return { ok: true, status: 200, json: async () => RELATED_SYSTEMS }
        if (url.includes('/api/tickets') && init?.method === 'POST') {
          return new Promise((resolve) => {
            resolvePost = () =>
              resolve({ ok: true, status: 201, json: async () => ({ ticketNumber: 'TKT-2026-000001' }) })
          })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    renderCreateTicket()
    await screen.findByLabelText(/category/i)
    await fillValidForm()

    const submitButton = screen.getByRole('button', { name: /submit/i })
    await userEvent.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())
    resolvePost()
  })
})

// UI-05 (AC-12, BR-11): an API failure shows an error and preserves the form.
describe('UI-05 API failure preserves the form', () => {
  it('shows an error message and keeps the entered values', async () => {
    mockFetch({ onTicketPost: () => ({ ok: false, status: 500, body: { error: 'Unable to create ticket' } }) })
    renderCreateTicket()

    await screen.findByLabelText(/category/i)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/unable to create ticket/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^summary/i)).toHaveValue('Laptop battery drains quickly')
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()
  })
})

// E2E-02 stand-in (no Playwright yet — see AppShell.test.tsx for the same
// caveat on Issue #14): full happy-path submission shows the real Ticket
// Number returned by the (mocked) backend.
describe('E2E-02 stand-in: happy path shows the backend Ticket Number', () => {
  it('shows the created Ticket Number on success', async () => {
    mockFetch({
      onTicketPost: () => ({ ok: true, status: 201, body: { ticketNumber: 'TKT-2026-000042' } }),
    })
    renderCreateTicket()

    await screen.findByLabelText(/category/i)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText('TKT-2026-000042')).toBeInTheDocument()
  })
})

// STYLE-01 (§8.3): required fields show an asterisk, and the read-only
// Ticket Number field is disabled/not editable.
describe('STYLE-01 required marker and read-only field', () => {
  it('marks required fields and keeps Ticket Number read-only', async () => {
    mockFetch({})
    const { container } = renderCreateTicket()
    await screen.findByLabelText(/category/i)

    const summaryLabel = container.querySelector('label[for="ticket-summary"]')
    expect(summaryLabel?.textContent).toContain('*')
    expect(screen.getByLabelText(/ticket number/i)).toBeDisabled()
  })
})
