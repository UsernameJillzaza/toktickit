import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MyTickets from '../../src/tickets/MyTickets'
import { RequesterProvider } from '../../src/requester/RequesterContext'

const REQUESTER = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' }

const ONE_TICKET = [
  {
    id: 1,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    requestedPriority: 'MEDIUM',
    currentStatus: 'NEW',
    createdAt: '2026-09-01T00:00:00Z',
    category: { name: 'Hardware' },
  },
]

function mockFetch(respond: (url: string) => { items: unknown[]; total: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = { ...respond(url), page: 1, pageSize: 10 }
      return { ok: true, status: 200, json: async () => body }
    }),
  )
}

function renderMyTickets() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <MyTickets />
      </RequesterProvider>
    </MemoryRouter>,
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

// UI-08 (AC-09): a requester with no tickets sees the empty state, not
// the no-results state.
describe('UI-08 empty state', () => {
  it('shows "no tickets yet" when the requester has never created one', async () => {
    mockFetch(() => ({ items: [], total: 0 }))
    renderMyTickets()

    expect(await screen.findByText(/haven't created any tickets yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/no tickets match your search/i)).not.toBeInTheDocument()
  })
})

// UI-09 (AC-10): a search that matches nothing shows the no-results state,
// with text distinct from the empty state, plus a way to clear it.
describe('UI-09 no-results state', () => {
  it('shows a distinct message and a Clear filters action', async () => {
    let lastUrl = ''
    mockFetch((url) => {
      lastUrl = url
      return url.includes('search=') ? { items: [], total: 0 } : { items: ONE_TICKET, total: 1 }
    })
    renderMyTickets()

    await screen.findByText('TKT-2026-000001')
    await userEvent.type(screen.getByLabelText(/search tickets/i), 'nothing matches this')
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }))

    expect(await screen.findByText(/no tickets match your search/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    expect(lastUrl).toContain('search=')
  })
})

// UI-10 (AC-08): pagination controls appear and are disabled at the edges.
describe('UI-10 pagination', () => {
  it('disables Previous on the first page and enables Next when there are more pages', async () => {
    mockFetch(() => ({ items: ONE_TICKET, total: 25 })) // pageSize 10 -> 3 pages
    renderMyTickets()

    await screen.findByText('TKT-2026-000001')
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument()
  })
})

// E2E-04 stand-in (no Playwright yet, same caveat as earlier Lab 2 Issues):
// switching requester changes which tickets are requested/shown.
describe('E2E-04 stand-in: switching requester re-queries with the new id', () => {
  it('requests tickets scoped to whichever requester is currently selected', async () => {
    const requestedIds: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const params = new URLSearchParams(url.split('?')[1])
        requestedIds.push(params.get('requesterId') ?? '')
        return { ok: true, status: 200, json: async () => ({ items: [], total: 0, page: 1, pageSize: 10 }) }
      }),
    )

    const { unmount } = renderMyTickets()
    await waitFor(() => expect(requestedIds).toContain('1'))
    unmount()

    window.localStorage.setItem(
      'toktickit.selectedRequester',
      JSON.stringify({ id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test' }),
    )
    // A fresh mount is the honest way to simulate "switched requester, then
    // loaded My Tickets again" — RequesterProvider only reads localStorage
    // once, on mount, not on every render.
    renderMyTickets()

    await waitFor(() => expect(requestedIds).toContain('2'))
  })
})
