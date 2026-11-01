import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StaffDashboard from '../../src/dashboard/StaffDashboard'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

// UI-13 … UI-16: the IT Staff / Administrator Dashboard (ui-spec §4.1, §4.3).

const STAFF: AuthUser = { id: 8, name: 'Arthit Wongsa', email: 'arthit.wongsa@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }

const row = (id: number, o: Record<string, unknown> = {}) => ({
  id,
  ticketNumber: `TKT-2026-${String(id).padStart(6, "0")}`,
  summary: `Summary of ticket ${id}`,
  status: 'IN_PROGRESS',
  itPriority: 'CRITICAL',
  owner: { id: 8, name: 'Arthit Wongsa' },
  updatedAt: '2026-11-01T08:00:00.000Z',
  ...o,
})

const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

function data(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-11-01T10:00:00.000Z',
    metrics: { unassigned: 4, myActive: 2, requesterReportsResolved: 1 },
    byStatus: Object.fromEntries(STATUSES.map((s, i) => [s, i + 1])),
    byItPriority: { LOW: 3, MEDIUM: 8, HIGH: 4, CRITICAL: 1 },
    urgent: [row(7), row(9, { owner: null })],
    recentlyUpdated: [row(11, { itPriority: 'LOW', status: 'OPEN' })],
    myRecentActions: [{ id: 41, ticketId: 12, ticketNumber: 'TKT-2026-000012', description: 'Replaced the HDMI switcher', status: 'COMPLETED', actionAt: '2026-11-01T07:00:00.000Z' }],
    ...overrides,
  }
}

const empty = () =>
  data({
    metrics: { unassigned: 0, myActive: 0, requesterReportsResolved: 0 },
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, 0])),
    byItPriority: Object.fromEntries(PRIORITIES.map((p) => [p, 0])),
    urgent: [],
    recentlyUpdated: [],
    myRecentActions: [],
  })

function stub(replies: Array<{ status: number; body?: unknown } | 'pending'>) {
  let n = 0
  const fetchMock = vi.fn(() => {
    const r = replies[Math.min(n++, replies.length - 1)]
    if (r === 'pending') return new Promise(() => {})
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderDash(user: AuthUser = STAFF) {
  return render(
    <MemoryRouter>
      <AuthProvider initialUser={user}>
        <StaffDashboard />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

const card = (name: string) => screen.getByRole('group', { name })
const href = (el: HTMLElement, name: string) => within(el).getByRole('link', { name }).getAttribute('href')

// UI-13 (FR-12, FR-13, AC-27, AC-31)
describe('UI-13 staff dashboard content and destinations', () => {
  it('shows each card’s number and a View link with a specific name and the documented destination', async () => {
    stub([{ status: 200, body: data() }])
    renderDash()
    await screen.findByRole('heading', { name: 'Dashboard' })

    expect(within(card('Unassigned')).getByText('4')).toBeInTheDocument()
    expect(href(card('Unassigned'), 'View unassigned tickets')).toBe('/staff/queue?owner=unassigned')
    expect(within(card('Assigned to me')).getByText('2')).toBeInTheDocument()
    expect(href(card('Assigned to me'), 'View tickets assigned to me')).toBe('/staff/queue?owner=me')
    expect(within(card('Requester reports resolved')).getByText('1')).toBeInTheDocument()
    expect(href(card('Requester reports resolved'), 'View tickets the requester reports as resolved')).toBe('/staff/queue?requesterResolved=true')
    expect(within(card('Requester reports resolved')).getByText('✓')).toBeInTheDocument()
  })

  it('lists the eight statuses and four priorities as links to the filtered queue', async () => {
    stub([{ status: 200, body: data() }])
    renderDash()
    const byStatus = await screen.findByRole('region', { name: 'By status' })
    expect(within(byStatus).getAllByRole('listitem')).toHaveLength(8)
    expect(href(byStatus, 'View Waiting for Requester tickets')).toBe('/staff/queue?status=WAITING_FOR_REQUESTER')
    expect(within(byStatus).getByText('8')).toBeInTheDocument() // CANCELLED is the 8th value
    const byPriority = screen.getByRole('region', { name: 'By IT priority (active)' })
    expect(within(byPriority).getAllByRole('listitem')).toHaveLength(4)
    expect(href(byPriority, 'View active Critical priority tickets')).toBe('/staff/queue?priority=CRITICAL')
    expect(within(byPriority).getByText('Critical')).toHaveClass('tt-badge', 'tt-badge-priority-CRITICAL')
  })

  it('shows the Urgent, Recently updated and My recent actions lists with their row links', async () => {
    stub([{ status: 200, body: data() }])
    renderDash()
    const urgent = await screen.findByRole('region', { name: 'Urgent' })
    expect(href(urgent, 'TKT-2026-000007')).toBe('/staff/tickets/7')
    expect(within(urgent).getByText('Owner: Arthit Wongsa')).toBeInTheDocument()
    expect(within(urgent).getByText('Unassigned')).toBeInTheDocument()
    expect(href(urgent, 'View all critical tickets')).toBe('/staff/queue?priority=CRITICAL')
    expect(within(urgent).getByText('Summary of ticket 7')).toHaveAttribute('title', 'Summary of ticket 7')

    const recent = screen.getByRole('region', { name: 'Recently updated' })
    expect(href(recent, 'TKT-2026-000011')).toBe('/staff/tickets/11')
    expect(within(recent).getByText('Open')).toHaveClass('tt-badge-status-OPEN')

    const actions = screen.getByRole('region', { name: 'My recent actions' })
    expect(href(actions, 'TKT-2026-000012')).toBe('/staff/tickets/12')
    expect(within(actions).getByText('Replaced the HDMI switcher')).toBeInTheDocument()
    expect(within(actions).getByText('✓ Completed')).toBeInTheDocument()
  })

  it('shows when the numbers were generated', async () => {
    stub([{ status: 200, body: data() }])
    renderDash()
    expect(await screen.findByText(/^Updated /)).toBeInTheDocument()
  })
})

// UI-14 (BR-29, AC-28)
describe('UI-14 an all-zero response', () => {
  it('keeps every card with 0 and shows a sentence in each empty list', async () => {
    stub([{ status: 200, body: empty() }])
    renderDash()
    await screen.findByRole('heading', { name: 'Dashboard' })
    for (const name of ['Unassigned', 'Assigned to me', 'Requester reports resolved']) {
      expect(within(card(name)).getByText('0')).toBeInTheDocument()
    }
    expect(screen.getByText('No urgent tickets.')).toBeInTheDocument()
    expect(screen.getByText('No tickets yet.')).toBeInTheDocument()
    expect(screen.getByText("You haven't recorded any actions yet.")).toBeInTheDocument()
    // The two count panels still list every key, each with 0.
    expect(within(screen.getByRole('region', { name: 'By status' })).getAllByText('0')).toHaveLength(8)
    expect(within(screen.getByRole('region', { name: 'By IT priority (active)' })).getAllByText('0')).toHaveLength(4)
  })
})

// UI-15 (AC-33)
describe('UI-15 loading, failure and forbidden', () => {
  it('shows a loading state with aria-busy while waiting', async () => {
    stub(['pending'])
    renderDash()
    expect(await screen.findByRole('status', { name: 'Loading the dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('shows a safe error with Retry on a 500 (no technical detail), and Retry fetches again', async () => {
    const fetchMock = stub([{ status: 500, body: { error: 'ECONNREFUSED stack trace' } }, { status: 200, body: data() }])
    renderDash()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the dashboard.")
    expect(alert).not.toHaveTextContent(/ECONNREFUSED|stack/)
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('group', { name: 'Unassigned' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([[[]], [{}], [{ metrics: {} }]])('treats an answer the screen cannot draw (%j) as a failure with Retry, not a crash', async (body) => {
    stub([{ status: 200, body }])
    renderDash()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the dashboard.")
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows the Forbidden page on a 403', async () => {
    stub([{ status: 403, body: { code: 'FORBIDDEN' } }])
    renderDash()
    expect(await screen.findByRole('heading', { name: "You don't have access to this page" })).toBeInTheDocument()
  })

  it('shows the error, not a blank page, when the network itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderDash()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the dashboard.")
  })
})

// UI-16 (BR-31, AC-30)
describe('UI-16 the users card', () => {
  const users = { total: 12, active: 10, inactive: 2, byRole: { REQUESTER: 6, IT_STAFF: 4, ADMIN: 2 } }

  it('is shown when the response contains users, with the per-role counts and a link to User Management', async () => {
    stub([{ status: 200, body: data({ users }) }])
    renderDash({ ...STAFF, role: 'ADMIN' })
    const usersCard = await screen.findByRole('group', { name: 'Users' })
    expect(within(usersCard).getByText('12')).toBeInTheDocument()
    expect(href(usersCard, 'View users')).toBe('/admin/users')
    const byRole = screen.getByRole('region', { name: 'Users by role' })
    expect(byRole).toHaveTextContent('10 active, 2 inactive')
    expect(byRole).toHaveTextContent('Requester: 6')
    expect(byRole).toHaveTextContent('IT Staff: 4')
    expect(byRole).toHaveTextContent('Administrator: 2')
  })

  it('is absent when the response has no users, even for an Administrator account', async () => {
    stub([{ status: 200, body: data() }])
    renderDash({ ...STAFF, role: 'ADMIN' })
    await screen.findByRole('group', { name: 'Unassigned' })
    expect(screen.queryByRole('group', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Users by role' })).not.toBeInTheDocument()
  })
})
