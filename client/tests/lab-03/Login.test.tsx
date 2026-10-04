import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Login from '../../src/auth/Login'
import { AuthProvider } from '../../src/auth/AuthContext'

type FetchImpl = (url: string, init?: RequestInit) => Promise<unknown>

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function renderLogin(fetchImpl: FetchImpl) {
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider initialUser={null}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<p>HOME PAGE</p>} />
          <Route path="/change-password" element={<p>CHANGE PASSWORD PAGE</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return fetchMock
}

async function fillAndSubmit(email: string, password: string) {
  if (email) await userEvent.type(screen.getByLabelText(/^email/i), email)
  if (password) await userEvent.type(screen.getByLabelText(/^password/i), password)
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

// UI-01 (AC-38): empty fields are caught before any request is made.
describe('UI-01 client-side validation', () => {
  it('shows field errors under Email and Password and does not call the API', async () => {
    const fetchMock = renderLogin(async () => jsonResponse(200, {}))
    await fillAndSubmit('', '')

    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// UI-02 (§8.1): busy state while the request is in flight.
describe('UI-02 busy state', () => {
  it('disables the button and shows "Signing in…" while waiting', async () => {
    renderLogin(() => new Promise(() => {})) // never resolves
    await fillAndSubmit('pim@toktickit.test', 'Secret123')

    const button = screen.getByRole('button', { name: /signing in/i })
    expect(button).toBeDisabled()
  })
})

// UI-03 (AC-05, D-14): generic error, keep the email, clear the password.
describe('UI-03 invalid credentials', () => {
  it('shows the generic message, keeps the email and clears the password', async () => {
    renderLogin(async () =>
      jsonResponse(401, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' }),
    )
    await fillAndSubmit('pim@toktickit.test', 'Wrong1234')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(screen.getByLabelText(/^email/i)).toHaveValue('pim@toktickit.test')
    expect(screen.getByLabelText(/^password/i)).toHaveValue('')
  })

  // The form is disabled while the request is in flight; focus must land
  // once it's enabled again, or keyboard users are left on <body>.
  it('moves focus to the password field so the user can retype it', async () => {
    renderLogin(async () =>
      jsonResponse(401, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' }),
    )
    await fillAndSubmit('pim@toktickit.test', 'Wrong1234')

    await screen.findByRole('alert')
    expect(screen.getByLabelText(/^password/i)).toHaveFocus()
  })
})

// UI-04 (AC-06): inactive account message.
describe('UI-04 inactive account', () => {
  it('shows the inactive-account message from the API', async () => {
    renderLogin(async () =>
      jsonResponse(403, {
        error: 'This account is inactive. Contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      }),
    )
    await fillAndSubmit('david@toktickit.test', 'Right1234')

    expect(await screen.findByRole('alert')).toHaveTextContent(/inactive/i)
  })
})

// UI-05 (AC-38): the server is unreachable.
describe('UI-05 network failure', () => {
  it('shows a safe failure message and keeps the email', async () => {
    renderLogin(async () => {
      throw new TypeError('Failed to fetch')
    })
    await fillAndSubmit('pim@toktickit.test', 'Secret123')

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to reach the server/i)
    expect(screen.getByLabelText(/^email/i)).toHaveValue('pim@toktickit.test')
  })
})

describe('successful sign-in', () => {
  it('goes to the home page', async () => {
    renderLogin(async () =>
      jsonResponse(200, {
        user: { id: 6, name: 'Pim', email: 'pim@toktickit.test', role: 'REQUESTER', mustChangePassword: false },
      }),
    )
    await fillAndSubmit('pim@toktickit.test', 'Secret123')
    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
  })

  it('goes to Change Password when the account still has an initial password (AC-02)', async () => {
    renderLogin(async () =>
      jsonResponse(200, {
        user: { id: 1, name: 'Jen', email: 'jen@toktickit.test', role: 'REQUESTER', mustChangePassword: true },
      }),
    )
    await fillAndSubmit('jen@toktickit.test', 'Welcome2026!')
    await waitFor(() => expect(screen.getByText('CHANGE PASSWORD PAGE')).toBeInTheDocument())
  })

  it('sends the email and password as JSON to /api/auth/login', async () => {
    const fetchMock = renderLogin(async () =>
      jsonResponse(200, {
        user: { id: 6, name: 'Pim', email: 'pim@toktickit.test', role: 'REQUESTER', mustChangePassword: false },
      }),
    )
    await fillAndSubmit('pim@toktickit.test', 'Secret123')
    await screen.findByText('HOME PAGE')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'pim@toktickit.test', password: 'Secret123' })
  })
})
