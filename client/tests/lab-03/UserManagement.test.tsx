import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UserManagement from '../../src/admin/UserManagement'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

const ME: AuthUser = { id: 11, name: 'Napat Chaiwong', email: 'napat.chaiwong@toktickit.test', role: 'ADMIN', mustChangePassword: false }

const USERS = [
  { id: 3, name: 'Arthit Wongsa', email: 'arthit.wongsa@toktickit.test', role: 'IT_STAFF', isActive: true, mustChangePassword: false, createdAt: '2026-10-01T00:00:00Z' },
  { id: 5, name: 'David Wilson', email: 'david.wilson@toktickit.test', role: 'REQUESTER', isActive: false, mustChangePassword: true, createdAt: '2026-09-01T00:00:00Z' },
  { id: 11, name: 'Napat Chaiwong', email: 'napat.chaiwong@toktickit.test', role: 'ADMIN', isActive: true, mustChangePassword: false, createdAt: '2026-10-01T00:00:00Z' },
]

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

type Responder = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined

function stubApi(onWrite: Responder = () => undefined, list: unknown[] = USERS) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      const r = onWrite(url, init)
      if (r) return jsonResponse(r.status, r.body)
    }
    if (url.startsWith('/api/admin/users')) return jsonResponse(200, list)
    return jsonResponse(404, {})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const listCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([u, init]) => String(u).startsWith('/api/admin/users') && !init?.method)
    .map(([u]) => new URL(String(u), 'http://localhost').searchParams)

const writes = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== 'GET')
    .map(([u, init]) => ({ url: String(u), method: init!.method, body: JSON.parse(String(init!.body)) }))

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider initialUser={ME}>
        <UserManagement />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

// UI-26 (AC-28)
describe('UI-26 user list', () => {
  it('shows Name / Email / Role / Status / Edit with badges and the must-change label', async () => {
    stubApi()
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Email', 'Role', 'Status', 'Edit'])

    const david = within(table).getByText('David Wilson').closest('tr')!
    expect(within(david).getByText('Requester')).toHaveClass('tt-badge-role-REQUESTER')
    expect(within(david).getByText('Inactive')).toBeInTheDocument()
    expect(within(david).getByText('Must change password')).toBeInTheDocument()
    expect(within(david).getByRole('button', { name: 'Edit David Wilson' })).toBeInTheDocument()

    const arthit = within(table).getByText('Arthit Wongsa').closest('tr')!
    expect(within(arthit).getByText('Active')).toBeInTheDocument()
  })

  it('search and role filter go into the request', async () => {
    const fetchMock = stubApi()
    renderPage()
    await screen.findByRole('table')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search name or email' }), 'wong')
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
    await waitFor(() => expect(listCalls(fetchMock).at(-1)!.get('search')).toBe('wong'))

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'IT_STAFF')
    await waitFor(() => {
      const q = listCalls(fetchMock).at(-1)!
      expect(q.get('role')).toBe('IT_STAFF')
      expect(q.get('search')).toBe('wong')
    })
  })

  it('says so when nobody matches', async () => {
    stubApi(undefined, [])
    renderPage()
    expect(await screen.findByText('No users match.')).toBeInTheDocument()
  })
})

// UI-27 (AC-29, AC-30)
describe('UI-27 create user', () => {
  it('catches empty and invalid fields before calling the API', async () => {
    const fetchMock = stubApi()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Create user' }))
    const form = screen.getByRole('form', { name: 'Create user' })
    await userEvent.click(within(form).getByRole('button', { name: 'Create user' }))

    expect(within(form).getByText('Name must be 2–100 characters.')).toBeInTheDocument()
    expect(within(form).getByText(/enter a valid email/i)).toBeInTheDocument()
    expect(within(form).getByText('Password is required.')).toBeInTheDocument()
    expect(within(form).getByLabelText(/^name/i)).toHaveAttribute('aria-invalid', 'true')
    expect(writes(fetchMock)).toEqual([])
  })

  it('posts a valid user and shows it as must-change-password', async () => {
    const created = { id: 20, name: 'Mali Srisuk', email: 'mali@toktickit.test', role: 'IT_STAFF', isActive: true, mustChangePassword: true, createdAt: '2026-10-04T00:00:00Z' }
    const fetchMock = stubApi((url) => (url === '/api/admin/users' ? { status: 201, body: created } : undefined))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Create user' }))
    const form = screen.getByRole('form', { name: 'Create user' })

    await userEvent.type(within(form).getByLabelText(/^name/i), 'Mali Srisuk')
    await userEvent.type(within(form).getByLabelText(/^email/i), 'Mali@toktickit.test')
    await userEvent.selectOptions(within(form).getByLabelText(/^role/i), 'IT_STAFF')
    await userEvent.type(within(form).getByLabelText(/^initial password/i), 'Firstday2026')
    await userEvent.click(within(form).getByRole('button', { name: 'Create user' }))

    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([
        {
          url: '/api/admin/users',
          method: 'POST',
          body: { name: 'Mali Srisuk', email: 'Mali@toktickit.test', role: 'IT_STAFF', isActive: true, initialPassword: 'Firstday2026' },
        },
      ]),
    )
    expect(await screen.findByText(/user created/i)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Create user' })).not.toBeInTheDocument()
  })

  it('shows 409 DUPLICATE_EMAIL under Email', async () => {
    stubApi(() => ({ status: 409, body: { error: 'Another account already uses this email.', code: 'DUPLICATE_EMAIL', field: 'email' } }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Create user' }))
    const form = screen.getByRole('form', { name: 'Create user' })
    await userEvent.type(within(form).getByLabelText(/^name/i), 'Second Arthit')
    await userEvent.type(within(form).getByLabelText(/^email/i), 'ARTHIT.wongsa@toktickit.test')
    await userEvent.type(within(form).getByLabelText(/^initial password/i), 'Firstday2026')
    await userEvent.click(within(form).getByRole('button', { name: 'Create user' }))

    expect(await within(form).findByText('Another account already uses this email.')).toBeInTheDocument()
    expect(within(form).getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('edit user', () => {
  it('sends only the fields that changed', async () => {
    const fetchMock = stubApi((url, init) => (init?.method === 'PATCH' ? { status: 200, body: { ...USERS[0], role: 'ADMIN' } } : undefined))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Arthit Wongsa' }))
    const form = screen.getByRole('form', { name: 'Edit Arthit Wongsa' })
    expect(within(form).queryByLabelText(/^initial password/i)).not.toBeInTheDocument()

    await userEvent.selectOptions(within(form).getByLabelText(/^role/i), 'ADMIN')
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes(fetchMock)).toEqual([{ url: '/api/admin/users/3', method: 'PATCH', body: { role: 'ADMIN' } }]))
  })

  it('sets a new initial password from the separate card', async () => {
    const fetchMock = stubApi((url) => (url.endsWith('/initial-password') ? { status: 200, body: { ...USERS[0], mustChangePassword: true } } : undefined))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Arthit Wongsa' }))
    const card = screen.getByRole('region', { name: 'Set a new initial password' })
    expect(within(card).getByText(/will be signed out and must choose a new password/i)).toBeInTheDocument()

    await userEvent.type(within(card).getByLabelText(/new initial password/i), 'Restart2026')
    await userEvent.click(within(card).getByRole('button', { name: 'Set initial password' }))
    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([{ url: '/api/admin/users/3/initial-password', method: 'POST', body: { initialPassword: 'Restart2026' } }]),
    )
  })
})

// UI-28 (AC-33, BR-36)
describe('UI-28 editing my own account', () => {
  it('disables Active and Role and explains why', async () => {
    stubApi()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Napat Chaiwong' }))
    const form = screen.getByRole('form', { name: 'Edit Napat Chaiwong' })
    expect(within(form).getByLabelText(/^role/i)).toBeDisabled()
    expect(within(form).getByLabelText(/^active/i)).toBeDisabled()
    expect(within(form).getByText("You can't deactivate or change the role of your own account.")).toBeInTheDocument()
    expect(within(form).getByLabelText(/^name/i)).toBeEnabled()
  })
})

// UI-29 (AC-34, BR-37)
describe('UI-29 last active Administrator', () => {
  it('shows the reason in an alert on the form', async () => {
    stubApi(() => ({ status: 409, body: { error: 'At least one active Administrator must remain.', code: 'LAST_ADMIN' } }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Arthit Wongsa' }))
    const form = screen.getByRole('form', { name: 'Edit Arthit Wongsa' })
    await userEvent.click(within(form).getByLabelText(/^active/i))
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('At least one active Administrator must remain.')
  })
})
