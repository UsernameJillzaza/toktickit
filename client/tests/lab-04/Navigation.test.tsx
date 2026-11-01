import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

// UI-20 (FR-14, AC-34): every role gets "Dashboard" as the first menu item,
// `/` lands on it, and it is marked as the current page.

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMIN'

const userOf = (role: Role) => ({ id: 7, name: `Test ${role}`, email: `${role.toLowerCase()}@toktickit.test`, role, mustChangePassword: false })
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function stubApi(me: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return json(200, { user: me })
      if (url === '/api/dashboard/requester') return json(200, { generatedAt: '2026-11-01T10:00:00.000Z', metrics: { open: 0, waitingForYou: 0, resolvedLast30Days: 0 }, needsAttention: [], recentlyUpdated: [] })
      if (url === '/api/dashboard/staff') {
        return json(200, { generatedAt: '2026-11-01T10:00:00.000Z', metrics: { unassigned: 0, myActive: 0, requesterReportsResolved: 0 }, byStatus: {}, byItPriority: {}, urgent: [], recentlyUpdated: [], myRecentActions: [] })
      }
      return json(200, { items: [], total: 0, page: 1, pageSize: 10 })
    }),
  )
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

const MENUS: Array<[Role, string[]]> = [
  ['REQUESTER', ['Dashboard', 'My Tickets', 'Create Ticket']],
  ['IT_STAFF', ['Dashboard', 'Ticket Queue']],
  ['ADMIN', ['Dashboard', 'Ticket Queue', 'User Management']],
]

describe('UI-20 navigation and the home redirect', () => {
  it.each(MENUS)('%s: the menu starts with Dashboard and holds exactly its other destinations', async (role, labels) => {
    stubApi(userOf(role))
    renderAt('/dashboard')
    const nav = await screen.findByRole('navigation')
    await within(nav).findByText(`Test ${role}`)
    const links = within(nav).getAllByRole('link').map((a) => a.textContent)
    expect(links.slice(0, labels.length)).toEqual(labels)
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it.each(MENUS)('%s: "/" lands on /dashboard, shows the Dashboard, and marks it as the current page', async (role) => {
    stubApi(userOf(role))
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    const nav = screen.getByRole('navigation')
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page'))
    // The other items are not marked.
    for (const other of within(nav).getAllByRole('link').filter((a) => a.textContent !== 'Dashboard')) {
      expect(other).not.toHaveAttribute('aria-current', 'page')
    }
  })

  it('the Requester sees the Requester dashboard and the staff sees the staff one (same route, different content)', async () => {
    stubApi(userOf('REQUESTER'))
    const first = renderAt('/dashboard')
    expect(await screen.findByRole('group', { name: 'Open tickets' })).toBeInTheDocument()
    first.unmount()

    stubApi(userOf('IT_STAFF'))
    renderAt('/dashboard')
    expect(await screen.findByRole('group', { name: 'Unassigned' })).toBeInTheDocument()
  })

  it('a signed-out visitor to /dashboard is sent to Login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { code: 'UNAUTHENTICATED' })))
    renderAt('/dashboard')
    expect(await screen.findByRole('heading', { name: /sign in to toktickit/i })).toBeInTheDocument()
  })
})
