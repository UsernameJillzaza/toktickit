import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMIN'

function userOf(role: Role, overrides: Record<string, unknown> = {}) {
  return { id: 7, name: `Test ${role}`, email: `${role.toLowerCase()}@toktickit.test`, role, mustChangePassword: false, ...overrides }
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

// Routes the shell's own calls: /api/auth/me decides who is signed in;
// everything else returns an empty-but-valid payload so pages render.
function stubApi(me: unknown | null) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return me ? jsonResponse(200, { user: me }) : jsonResponse(401, { code: 'UNAUTHENTICATED' })
    if (url === '/api/auth/logout' && init?.method === 'POST') return { ok: true, status: 204, json: async () => ({}) }
    if (url.startsWith('/api/tickets')) return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 10 })
    return jsonResponse(200, [])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

// UI-10 (AC-10, FR-06): navigation shows only what the role may use.
describe('UI-10 role navigation', () => {
  it('Requester sees My Tickets and Create Ticket, plus name, role badge, Change password and Log out', async () => {
    stubApi(userOf('REQUESTER'))
    renderAt('/my-tickets')

    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'My Tickets' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Create Ticket' })).toBeInTheDocument()
    expect(within(nav).getByText('Test REQUESTER')).toBeInTheDocument()
    expect(within(nav).getByText('Requester')).toHaveClass('tt-badge', 'tt-badge-role-REQUESTER')
    expect(within(nav).getByRole('link', { name: /change password/i })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /log out/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /change requester/i })).not.toBeInTheDocument()
  })

  it('IT Staff does not see Requester destinations', async () => {
    stubApi(userOf('IT_STAFF'))
    renderAt('/')

    const nav = await screen.findByRole('navigation')
    await within(nav).findByText('IT Staff')
    expect(within(nav).queryByRole('link', { name: 'My Tickets' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Create Ticket' })).not.toBeInTheDocument()
  })

  it('marks the current page with aria-current', async () => {
    stubApi(userOf('REQUESTER'))
    renderAt('/my-tickets')
    const link = await screen.findByRole('link', { name: 'My Tickets' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})

// UI-11 (AC-09)
describe('UI-11 unauthenticated access', () => {
  it('sends a signed-out visitor from /my-tickets to the Login screen', async () => {
    stubApi(null)
    renderAt('/my-tickets')
    expect(await screen.findByRole('heading', { name: /sign in to toktickit/i })).toBeInTheDocument()
  })
})

// UI-12 (AC-02, BR-02)
describe('UI-12 pending password change', () => {
  it('sends a user with an initial password to Change Password, without the app navigation', async () => {
    stubApi(userOf('REQUESTER', { mustChangePassword: true }))
    renderAt('/my-tickets')

    expect(await screen.findByRole('heading', { name: /choose a new password/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My Tickets' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })
})

// UI-13 (AC-10, AC-35): a destination outside the role shows Forbidden.
describe('UI-13 forbidden destination', () => {
  it('IT Staff opening a Requester-only URL sees the Forbidden page', async () => {
    stubApi(userOf('IT_STAFF'))
    renderAt('/create-ticket')
    expect(await screen.findByRole('heading', { name: /you don't have access to this page/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/summary/i)).not.toBeInTheDocument()
  })
})

// UI-14 (AC-07)
describe('UI-14 log out', () => {
  it('calls the logout API and returns to the Login screen', async () => {
    const fetchMock = stubApi(userOf('REQUESTER'))
    renderAt('/my-tickets')

    await userEvent.click(await screen.findByRole('button', { name: /log out/i }))

    expect(await screen.findByRole('heading', { name: /sign in to toktickit/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
  })
})

// UI-30 (BR-11, BR-13): the session ends while a page is open (expired,
// logged out elsewhere, or deactivated) — the next API call's 401 returns
// the user to Login instead of leaving a broken page on screen.
describe('UI-30 session ends mid-use', () => {
  it('a 401 from a page request sends the user to the Login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/me') return jsonResponse(200, { user: userOf('REQUESTER') })
        return jsonResponse(401, { error: 'Authentication required.', code: 'UNAUTHENTICATED' })
      }),
    )
    renderAt('/my-tickets')
    expect(await screen.findByRole('heading', { name: /sign in to toktickit/i })).toBeInTheDocument()
  })
})

// BR-42: the Lab 2 selector's leftover client state is removed.
describe('BR-42 legacy selector state', () => {
  it('clears toktickit.selectedRequester from localStorage on startup', async () => {
    window.localStorage.setItem('toktickit.selectedRequester', JSON.stringify({ id: 1, name: 'x', email: 'x' }))
    stubApi(userOf('REQUESTER'))
    renderAt('/my-tickets')
    await screen.findByRole('navigation')
    await waitFor(() => expect(window.localStorage.getItem('toktickit.selectedRequester')).toBeNull())
  })
})
