import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RequesterDashboard from '../../src/dashboard/RequesterDashboard'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

// UI-17 … UI-19: the Requester Dashboard (ui-spec §4.1, §4.2).

const ME: AuthUser = { id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test', role: 'REQUESTER', mustChangePassword: false }

const row = (id: number, o: Record<string, unknown> = {}) => ({
  id,
  ticketNumber: `TKT-2026-${String(id).padStart(6, "0")}`,
  summary: `Summary of ticket ${id}`,
  status: 'WAITING_FOR_REQUESTER',
  updatedAt: '2026-11-01T08:00:00.000Z',
  ...o,
})

const data = (overrides: Record<string, unknown> = {}) => ({
  generatedAt: '2026-11-01T10:00:00.000Z',
  metrics: { open: 3, waitingForYou: 1, resolvedLast30Days: 2 },
  needsAttention: [row(12)],
  recentlyUpdated: [row(12), row(5, { status: 'RESOLVED' })],
  ...overrides,
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

const renderDash = () =>
  render(
    <MemoryRouter>
      <AuthProvider initialUser={ME}>
        <RequesterDashboard />
      </AuthProvider>
    </MemoryRouter>,
  )

afterEach(() => vi.unstubAllGlobals())

const card = (name: string) => screen.getByRole('group', { name })
const href = (el: HTMLElement, name: string) => within(el).getByRole('link', { name }).getAttribute('href')

// UI-17 (FR-11, FR-13, AC-25, AC-31)
describe('UI-17 Requester dashboard content and destinations', () => {
  it('shows the three cards with their numbers and My Tickets destinations', async () => {
    stub([{ status: 200, body: data() }])
    renderDash()
    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(within(card('Open tickets')).getByText('3')).toBeInTheDocument()
    expect(href(card('Open tickets'), 'View open tickets')).toBe('/my-tickets?status=open')
    expect(within(card('Waiting for you')).getByText('1')).toBeInTheDocument()
    expect(href(card('Waiting for you'), 'View tickets waiting for you')).toBe('/my-tickets?status=WAITING_FOR_REQUESTER')
    expect(card('Waiting for you')).toHaveClass('tt-metric-accent') // amber accent only when > 0
    expect(within(card('Resolved (last 30 days)')).getByText('2')).toBeInTheDocument()
    expect(href(card('Resolved (last 30 days)'), 'View tickets resolved in the last 30 days')).toBe('/my-tickets?status=resolved&updatedWithinDays=30')
  })

  it('lists needs-attention and recently-updated tickets, each linking to the requester’s ticket page, with no IT Priority', async () => {
    stub([{ status: 200, body: data() }])
    renderDash()
    const attention = await screen.findByRole('region', { name: 'Needs your attention' })
    expect(href(attention, 'TKT-2026-000012')).toBe('/tickets/12')
    expect(within(attention).getByText('Waiting for Requester')).toBeInTheDocument()
    const recent = screen.getByRole('region', { name: 'Recently updated' })
    expect(within(recent).getAllByRole('listitem')).toHaveLength(2)
    expect(href(recent, 'TKT-2026-000005')).toBe('/tickets/5')
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument()
  })

  it('has no accent on the Waiting card when nothing is waiting', async () => {
    stub([{ status: 200, body: data({ metrics: { open: 1, waitingForYou: 0, resolvedLast30Days: 0 } }) }])
    renderDash()
    await screen.findByRole('group', { name: 'Waiting for you' })
    expect(card('Waiting for you')).not.toHaveClass('tt-metric-accent')
  })
})

// UI-18 (BR-29, AC-28)
describe('UI-18 a Requester with nothing yet', () => {
  it('keeps the cards at 0 and shows an empty sentence in each list', async () => {
    stub([{ status: 200, body: data({ metrics: { open: 0, waitingForYou: 0, resolvedLast30Days: 0 }, needsAttention: [], recentlyUpdated: [] }) }])
    renderDash()
    await screen.findByRole('heading', { name: 'Dashboard' })
    for (const name of ['Open tickets', 'Waiting for you', 'Resolved (last 30 days)']) {
      expect(within(card(name)).getByText('0')).toBeInTheDocument()
    }
    expect(screen.getByText('No tickets need your attention.')).toBeInTheDocument()
    expect(screen.getByText("You haven't created any tickets yet.")).toBeInTheDocument()
  })
})

// UI-19 (AC-33)
describe('UI-19 loading and failure', () => {
  it('shows a loading state with aria-busy', async () => {
    stub(['pending'])
    renderDash()
    expect(await screen.findByRole('status', { name: 'Loading the dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  })

  it.each([[[]], [{}], [{ metrics: {}, needsAttention: 'no' }]])('treats an answer the screen cannot draw (%j) as a failure, not a crash', async (body) => {
    stub([{ status: 200, body }])
    renderDash()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the dashboard.")
  })

  it('shows a safe error with Retry, and Retry loads the dashboard', async () => {
    const fetchMock = stub([{ status: 500 }, { status: 200, body: data() }])
    renderDash()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the dashboard.")
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('group', { name: 'Open tickets' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
