import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import MyTickets from '../../src/tickets/MyTickets'
import StaffTicketQueue from '../../src/staff/StaffTicketQueue'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

// UI-21, UI-22 (AC-32): the dashboard cards link to lists filtered through the
// URL. The screens must send those filters to the API and show a chip that
// removes them.

const REQUESTER: AuthUser = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test', role: 'REQUESTER', mustChangePassword: false }
const STAFF: AuthUser = { id: 8, name: 'Arthit Wongsa', email: 'arthit.wongsa@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }

function stubList() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/categories') return { ok: true, status: 200, json: async () => [] }
    return { ok: true, status: 200, json: async () => ({ items: [], total: 0, page: 1, pageSize: 10 }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Query strings of the list requests made so far. */
const listQueries = (fetchMock: ReturnType<typeof stubList>, prefix: string) =>
  fetchMock.mock.calls.filter(([u]) => String(u).startsWith(prefix)).map(([u]) => new URL(String(u), 'http://localhost').searchParams)

function Probe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

afterEach(() => vi.unstubAllGlobals())

function renderMyTickets(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialUser={REQUESTER}>
        <Routes>
          <Route path="/my-tickets" element={<><MyTickets /><Probe /></>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function renderQueue(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialUser={STAFF}>
        <Routes>
          <Route path="/staff/queue" element={<><StaffTicketQueue /><Probe /></>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

// UI-21
describe('UI-21 My Tickets reads status and updatedWithinDays from the URL', () => {
  it('sends both to the API and shows a chip for each', async () => {
    const fetchMock = stubList()
    renderMyTickets('/my-tickets?status=resolved&updatedWithinDays=30')
    await waitFor(() => expect(listQueries(fetchMock, '/api/tickets')).toHaveLength(1))
    const q = listQueries(fetchMock, '/api/tickets')[0]
    expect(q.get('status')).toBe('resolved')
    expect(q.get('updatedWithinDays')).toBe('30')

    const chips = screen.getByRole('list', { name: 'Active filters' })
    expect(within(chips).getByText('Status: Resolved tickets')).toBeInTheDocument()
    expect(within(chips).getByText('Updated in the last 30 days')).toBeInTheDocument()
  })

  it('shows a single status by its name, and the explicit status goes to the API unchanged', async () => {
    const fetchMock = stubList()
    renderMyTickets('/my-tickets?status=WAITING_FOR_REQUESTER')
    await waitFor(() => expect(listQueries(fetchMock, '/api/tickets')).toHaveLength(1))
    expect(listQueries(fetchMock, '/api/tickets')[0].get('status')).toBe('WAITING_FOR_REQUESTER')
    expect(screen.getByText('Status: Waiting for Requester')).toBeInTheDocument()
  })

  it('removing a chip drops that filter from the URL and the next request, and keeps the other', async () => {
    const fetchMock = stubList()
    renderMyTickets('/my-tickets?status=resolved&updatedWithinDays=30')
    await screen.findByRole('list', { name: 'Active filters' })

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Updated in the last 30 days' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/my-tickets?status=resolved'))
    expect(screen.getByTestId('location').textContent).not.toContain('updatedWithinDays')
    await waitFor(() => expect(listQueries(fetchMock, '/api/tickets').at(-1)!.has('updatedWithinDays')).toBe(false))
    expect(listQueries(fetchMock, '/api/tickets').at(-1)!.get('status')).toBe('resolved')

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Status: Resolved tickets' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument())
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/my-tickets$/)
  })

  it('with no filters in the URL there are no chips and nothing extra is sent', async () => {
    const fetchMock = stubList()
    renderMyTickets('/my-tickets')
    await waitFor(() => expect(listQueries(fetchMock, '/api/tickets')).toHaveLength(1))
    const q = listQueries(fetchMock, '/api/tickets')[0]
    expect(q.has('status')).toBe(false)
    expect(q.has('updatedWithinDays')).toBe(false)
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument()
  })

  it('a filtered list with no result says no tickets match (not "you have none") and Clear filters empties the URL', async () => {
    stubList()
    renderMyTickets('/my-tickets?status=open')
    expect(await screen.findByText('No tickets match your search.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/my-tickets$/))
  })
})

// UI-22
describe('UI-22 the queue reads the dashboard’s parameters from the URL', () => {
  it('requesterResolved=true is sent to the API and shown as a removable chip', async () => {
    const fetchMock = stubList()
    renderQueue('/staff/queue?requesterResolved=true')
    await waitFor(() => expect(listQueries(fetchMock, '/api/staff/tickets')).toHaveLength(1))
    expect(listQueries(fetchMock, '/api/staff/tickets')[0].get('requesterResolved')).toBe('true')
    expect(screen.getByText('Requester reports resolved')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Requester reports resolved' }))
    await waitFor(() => expect(listQueries(fetchMock, '/api/staff/tickets').at(-1)!.has('requesterResolved')).toBe(false))
    expect(screen.queryByText('Requester reports resolved')).not.toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).not.toContain('requesterResolved')
  })

  it.each([
    ['owner=unassigned', 'unassigned', 'Unassigned'],
    ['owner=me', 'me', 'My tickets'],
  ])('%s selects the matching quick filter and sends owner=%s', async (query, owner, button) => {
    const fetchMock = stubList()
    renderQueue(`/staff/queue?${query}`)
    await waitFor(() => expect(listQueries(fetchMock, '/api/staff/tickets')).toHaveLength(1))
    expect(listQueries(fetchMock, '/api/staff/tickets')[0].get('owner')).toBe(owner)
    expect(screen.getByRole('button', { name: button })).toHaveAttribute('aria-pressed', 'true')
  })

  it('status and priority links from the dashboard reach the existing filters', async () => {
    const fetchMock = stubList()
    renderQueue('/staff/queue?status=WAITING_FOR_REQUESTER&priority=CRITICAL')
    await waitFor(() => expect(listQueries(fetchMock, '/api/staff/tickets')).toHaveLength(1))
    const q = listQueries(fetchMock, '/api/staff/tickets')[0]
    expect(q.get('status')).toBe('WAITING_FOR_REQUESTER')
    expect(q.get('priority')).toBe('CRITICAL')
  })

  it('the filtered "empty" result says no tickets match these filters', async () => {
    stubList()
    renderQueue('/staff/queue?requesterResolved=true')
    expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
  })
})

// Review of #76.
describe('UI-21 / UI-22 the opened list says its total, and explains a refused filter', () => {
  it('My Tickets prints the total next to the chips so it can be read against the card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [1, 2, 3].map((id) => ({ id, ticketNumber: `TKT-2026-00000${id}`, summary: `Ticket ${id}`, requestedPriority: 'LOW', currentStatus: 'OPEN', createdAt: '2026-09-01T00:00:00Z', category: { name: 'Hardware' } })),
          total: 3,
          page: 1,
          pageSize: 10,
        }),
      })),
    )
    renderMyTickets('/my-tickets?status=open')
    expect(await screen.findByText('3 tickets')).toBeInTheDocument()
  })

  it('My Tickets shows the server’s message when it refuses a filter value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'status must be open, resolved, or one of: NEW, OPEN.', code: 'VALIDATION_ERROR', field: 'status' }) })),
    )
    renderMyTickets('/my-tickets?status=banana')
    expect(await screen.findByRole('alert')).toHaveTextContent('status must be open, resolved')
  })

  it('the queue shows the server’s message when it refuses requesterResolved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/categories'
          ? { ok: true, status: 200, json: async () => [] }
          : { ok: false, status: 400, json: async () => ({ error: 'requesterResolved must be true.', code: 'VALIDATION_ERROR', field: 'requesterResolved' }) },
      ),
    )
    renderQueue('/staff/queue?requesterResolved=false')
    expect(await screen.findByRole('alert')).toHaveTextContent('requesterResolved must be true.')
  })
})
