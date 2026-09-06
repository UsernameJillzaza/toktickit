import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

// Component-level coverage for the FR-01/FR-02 flow (RequireRequester guard +
// shell display + Change Requester). Full Playwright E2E coverage
// (E2E-01, E2E-05 in tests.md) is added in the Phase 8 Issue once
// @playwright/test is installed — these are a substantive stand-in until then.

const REQUESTERS = [{ id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' }]

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => REQUESTERS })),
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('AC-02 / E2E-05 stand-in: unselected requester is guarded', () => {
  it('redirects "/" to the Requester Selection screen when nothing is selected', async () => {
    mockFetch()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument(),
    )
    expect(screen.queryByText('TokTickIT IT Service Desk')).not.toBeInTheDocument()
  })
})

describe('FR-01/FR-02 stand-in: selection persists and Change Requester works', () => {
  it('shows the home page directly on a fresh mount when a requester is already stored', () => {
    window.localStorage.setItem(
      'toktickit.selectedRequester',
      JSON.stringify(REQUESTERS[0]),
    )
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('TokTickIT IT Service Desk')).toBeInTheDocument()
    expect(screen.getByText('Jennifer Anderson')).toBeInTheDocument()
  })

  it('clears the stored requester and returns to the selector on Change Requester', async () => {
    window.localStorage.setItem(
      'toktickit.selectedRequester',
      JSON.stringify(REQUESTERS[0]),
    )
    mockFetch()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: /change requester/i }))

    expect(window.localStorage.getItem('toktickit.selectedRequester')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument(),
    )
  })
})
