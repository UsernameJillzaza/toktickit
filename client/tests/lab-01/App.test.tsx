import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../src/App'

const HEALTH_OK = { status: 'ok', service: 'TokTickIT API' }
const CATEGORIES = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
  { id: 4, name: 'Network' },
]

// Replace the global fetch so the UI tests run without a backend or database.
function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = handler(url)
      if (body === null) throw new Error('network down')
      return { ok: true, status: 200, json: async () => body }
    }),
  )
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('UI-01 heading', () => {
  it('renders the TokTickIT heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /TokTickIT IT Service Desk/i }),
    ).toBeInTheDocument()
  })
})

describe('UI-02 loading to list', () => {
  it('shows the four categories after Check System', async () => {
    mockFetch((url) => (url.includes('health') ? HEALTH_OK : CATEGORIES))
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /check system/i }))

    await waitFor(() =>
      expect(screen.getByText('Hardware')).toBeInTheDocument(),
    )
    expect(screen.getByText('Account and Access')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
  })
})

describe('UI-03 error state', () => {
  it('shows a useful error message when the API fails', async () => {
    mockFetch(() => null)
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /check system/i }))

    await waitFor(() =>
      expect(
        screen.getByText(/Unable to connect to TokTickIT API/i),
      ).toBeInTheDocument(),
    )
  })
})
