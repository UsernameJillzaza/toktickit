import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import StaffTicketQueue from '../../src/staff/StaffTicketQueue'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

const STAFF: AuthUser = { id: 8, name: 'Arthit Wongsa', email: 'arthit.wongsa@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }

const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 4, name: 'Network' },
]

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    ticketNumber: 'TKT-2026-000012',
    summary: 'VPN disconnects every 10 minutes',
    currentStatus: 'WAITING_FOR_REQUESTER',
    requestedPriority: 'MEDIUM',
    itPriority: 'CRITICAL',
    createdAt: '2026-09-28T03:00:00.000Z',
    updatedAt: '2026-10-01T03:00:00.000Z',
    requesterResolvedAt: null,
    category: { id: 4, name: 'Network' },
    requester: { id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test' },
    owner: null,
    ...overrides,
  }
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

type QueueResponder = (url: URL) => { status?: number; body?: unknown } | Promise<never>

function stubApi(respond: QueueResponder) {
  const fetchMock = vi.fn(async (input: string) => {
    if (input === '/api/categories') return jsonResponse(200, CATEGORIES)
    const url = new URL(input, 'http://localhost')
    const r = await respond(url)
    return jsonResponse(r.status ?? 200, r.body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function queueCalls(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.startsWith('/api/staff/tickets'))
    .map((u) => new URL(u, 'http://localhost').searchParams)
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderQueue(path = '/staff/queue') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialUser={STAFF}>
        <Routes>
          <Route path="/staff/queue" element={<><StaffTicketQueue /><LocationProbe /></>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const page = (items: unknown[], total = items.length, extra = {}) => ({ body: { items, total, page: 1, pageSize: 10, ...extra } })

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

// UI-15 (AC-14): the desktop table has the seven ui-spec columns.
describe('UI-15 queue table', () => {
  it('renders seven columns with badges, requester, and "Unassigned"', async () => {
    stubApi(() => page([ticket()], 1))
    renderQueue()

    const table = await screen.findByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Ticket', 'Requester', 'Category', 'IT Priority', 'Status', 'Owner', 'Last Updated'])

    const row = within(table).getAllByRole('row')[1]
    expect(within(row).getByRole('link', { name: /TKT-2026-000012/ })).toHaveAttribute('href', '/staff/tickets/12')
    expect(within(row).getByText('VPN disconnects every 10 minutes')).toBeInTheDocument()
    expect(within(row).getByText('Michael Brown')).toBeInTheDocument()
    expect(within(row).getByText('Network')).toBeInTheDocument()
    expect(within(row).getByText('Unassigned')).toBeInTheDocument()
    expect(within(row).getByText('Critical')).toBeInTheDocument()
    expect(within(row).getByText('Waiting for Requester')).toBeInTheDocument()
  })

  it('shows the owner name and the "Requester reports resolved" indicator', async () => {
    stubApi(() =>
      page([ticket({ owner: { id: 8, name: 'Arthit Wongsa' }, requesterResolvedAt: '2026-10-01T03:00:00.000Z' })]),
    )
    renderQueue()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Arthit Wongsa')).toBeInTheDocument()
    expect(within(table).getByText(/requester reports resolved/i)).toBeInTheDocument()
  })

  it('shows the total and page position', async () => {
    stubApi(() => page([ticket()], 23))
    renderQueue()
    expect(await screen.findByText('23 tickets')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  })
})

// STYLE-01 (AC-37, ui-spec §2)
describe('STYLE-01 badge classes', () => {
  it('IT Priority and Status badges carry tt-badge classes and readable text', async () => {
    stubApi(() => page([ticket()]))
    renderQueue()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Critical')).toHaveClass('tt-badge', 'tt-badge-priority-CRITICAL')
    expect(within(table).getByText('Waiting for Requester')).toHaveClass('tt-badge', 'tt-badge-status-WAITING_FOR_REQUESTER')
  })
})

// UI-16 (AC-15): every control maps onto the URL and the API query.
describe('UI-16 filters drive the URL and the request', () => {
  it('starts with the default query', async () => {
    const fetchMock = stubApi(() => page([ticket()]))
    renderQueue()
    await screen.findByRole('table')
    const q = queueCalls(fetchMock)[0]
    expect(Object.fromEntries(q)).toEqual({ status: 'active', owner: 'any', sort: 'createdAt:desc', page: '1', pageSize: '10' })
  })

  it('"My tickets" and "Unassigned" quick filters set owner', async () => {
    const fetchMock = stubApi(() => page([ticket()]))
    renderQueue()
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: 'My tickets' }))
    await waitFor(() => expect(queueCalls(fetchMock).at(-1)!.get('owner')).toBe('me'))
    expect(screen.getByRole('button', { name: 'My tickets' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location')).toHaveTextContent('view=mine')

    await userEvent.click(screen.getByRole('button', { name: 'Unassigned' }))
    await waitFor(() => expect(queueCalls(fetchMock).at(-1)!.get('owner')).toBe('unassigned'))
  })

  it('dropdowns and search set their parameters and reset to page 1', async () => {
    const fetchMock = stubApi(() => page([ticket()], 30))
    renderQueue('/staff/queue?page=3')
    await screen.findByRole('table')
    expect(queueCalls(fetchMock).at(-1)!.get('page')).toBe('3')

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'RESOLVED')
    await waitFor(() => expect(queueCalls(fetchMock).at(-1)!.get('status')).toBe('RESOLVED'))
    expect(queueCalls(fetchMock).at(-1)!.get('page')).toBe('1')

    await userEvent.selectOptions(screen.getByLabelText('IT Priority'), 'HIGH')
    await userEvent.selectOptions(await screen.findByLabelText('Category'), '4')
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'itPriority:desc')
    await userEvent.type(screen.getByRole('searchbox', { name: /search tickets/i }), 'vpn')
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }))

    await waitFor(() => {
      const q = queueCalls(fetchMock).at(-1)!
      expect(q.get('priority')).toBe('HIGH')
      expect(q.get('categoryId')).toBe('4')
      expect(q.get('sort')).toBe('itPriority:desc')
      expect(q.get('search')).toBe('vpn')
      expect(q.get('page')).toBe('1')
    })
  })

  it('Next moves to page 2', async () => {
    const fetchMock = stubApi(() => page([ticket()], 23))
    renderQueue()
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }))
    await waitFor(() => expect(queueCalls(fetchMock).at(-1)!.get('page')).toBe('2'))
  })
})

// UI-17 (AC-16): empty, no-results and failure never look alike.
describe('UI-17 queue states', () => {
  it('empty queue (no filters)', async () => {
    stubApi(() => page([], 0))
    renderQueue()
    expect(await screen.findByText('No tickets in the queue yet.')).toBeInTheDocument()
    expect(screen.queryByText(/match these filters/i)).not.toBeInTheDocument()
  })

  it('no results for the chosen filters, with Clear filters', async () => {
    const fetchMock = stubApi(() => page([], 0))
    renderQueue('/staff/queue?view=unassigned&priority=CRITICAL')
    expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
    expect(screen.queryByText('No tickets in the queue yet.')).not.toBeInTheDocument()

    const clearButtons = screen.getAllByRole('button', { name: /clear filters/i })
    await userEvent.click(clearButtons[clearButtons.length - 1])
    await waitFor(() => {
      const q = queueCalls(fetchMock).at(-1)!
      expect(q.get('owner')).toBe('any')
      expect(q.get('priority')).toBeNull()
    })
  })

  it('failure shows an alert with Retry that tries again', async () => {
    let calls = 0
    stubApi(() => {
      calls++
      return calls === 1 ? { status: 500, body: { error: 'Unable to load the ticket queue.' } } : page([ticket()])
    })
    renderQueue()
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load the ticket queue/i)
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('shows a loading status while waiting', async () => {
    stubApi(() => new Promise<never>(() => {}))
    renderQueue()
    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i)
  })
})
