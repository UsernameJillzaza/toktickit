import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ChangePassword from '../../src/auth/ChangePassword'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

const FORCED_USER: AuthUser = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@toktickit.test',
  role: 'REQUESTER',
  mustChangePassword: true,
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function renderChangePassword(fetchImpl: (url: string, init?: RequestInit) => Promise<unknown>) {
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MemoryRouter initialEntries={['/change-password']}>
      <AuthProvider initialUser={FORCED_USER}>
        <Routes>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/my-tickets" element={<p>MY TICKETS PAGE</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  return fetchMock
}

async function fill(current: string, next: string, confirm: string) {
  if (current) await userEvent.type(screen.getByLabelText(/^current password/i), current)
  if (next) await userEvent.type(screen.getByLabelText(/^new password/i), next)
  if (confirm) await userEvent.type(screen.getByLabelText(/^confirm new password/i), confirm)
  await userEvent.click(screen.getByRole('button', { name: /save new password/i }))
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('forced mode', () => {
  it('explains why the user must choose a new password and always shows the policy', () => {
    renderChangePassword(async () => jsonResponse(200, {}))
    expect(screen.getByRole('heading', { name: /choose a new password/i })).toBeInTheDocument()
    expect(screen.getByText(/at least one number/i)).toBeInTheDocument()
  })
})

// UI-06 (AC-08, BR-10): the policy is checked before any request.
describe('UI-06 client-side policy check', () => {
  it('shows the rule under New password and does not call the API', async () => {
    const fetchMock = renderChangePassword(async () => jsonResponse(200, {}))
    await fill('Welcome2026!', 'short1', 'short1')

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password/i)).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a password with no number', async () => {
    const fetchMock = renderChangePassword(async () => jsonResponse(200, {}))
    await fill('Welcome2026!', 'onlyletters', 'onlyletters')
    expect(screen.getByText(/at least one number/i, { selector: '.invalid-feedback' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// UI-07 (AC-08): confirmation must match.
describe('UI-07 confirmation mismatch', () => {
  it('shows "Passwords do not match." under Confirm', async () => {
    const fetchMock = renderChangePassword(async () => jsonResponse(200, {}))
    await fill('Welcome2026!', 'Brandnew456', 'Brandnew457')

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// UI-08 (AC-08): server-side rejections land under the field the server names.
describe('UI-08 server validation', () => {
  it('shows PASSWORD_REUSE under New password', async () => {
    renderChangePassword(async () =>
      jsonResponse(400, {
        error: 'New password must be different from your current password.',
        code: 'PASSWORD_REUSE',
        field: 'newPassword',
      }),
    )
    await fill('Welcome2026!', 'Welcome2026!', 'Welcome2026!')
    expect(await screen.findByText(/must be different from your current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a wrong current password under Current password', async () => {
    renderChangePassword(async () =>
      jsonResponse(400, {
        error: 'Current password is incorrect.',
        code: 'VALIDATION_ERROR',
        field: 'currentPassword',
      }),
    )
    await fill('Wrong12345', 'Brandnew456', 'Brandnew456')
    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^current password/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

// UI-09 (AC-02): success continues into the app as the user's role.
describe('UI-09 success', () => {
  it('posts the passwords, then continues to the requester home page', async () => {
    const fetchMock = renderChangePassword(async () =>
      jsonResponse(200, { user: { ...FORCED_USER, mustChangePassword: false } }),
    )
    await fill('Welcome2026!', 'Brandnew456', 'Brandnew456')

    expect(await screen.findByText('MY TICKETS PAGE')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/change-password')
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: 'Welcome2026!',
      newPassword: 'Brandnew456',
    })
  })
})
