import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RequesterSelect from '../../src/requester/RequesterSelect'
import { RequesterProvider } from '../../src/requester/RequesterContext'

const REQUESTERS = [
  { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' },
  { id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test' },
]

function mockFetch(handler: () => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const body = handler()
      if (body === null) throw new Error('network down')
      return { ok: true, status: 200, json: async () => body }
    }),
  )
}

function renderSelect() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <RequesterSelect />
      </RequesterProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

// UI-01: the selector renders its loading, populated, empty, and failure
// states correctly.
describe('UI-01 selector states', () => {
  it('shows a loading state before the requesters resolve', () => {
    mockFetch(() => new Promise(() => {})) // never resolves during this assertion
    renderSelect()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('shows the dropdown populated with active requesters once loaded', async () => {
    mockFetch(() => REQUESTERS)
    renderSelect()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument(),
    )
    expect(screen.getByText('Jennifer Anderson')).toBeInTheDocument()
    expect(screen.getByText('Michael Brown')).toBeInTheDocument()
  })

  // Requested change: Continue must not be usable until a real choice is
  // made — no requester should be pre-selected on load.
  it('does not pre-select a requester and keeps Continue disabled until one is chosen', async () => {
    mockFetch(() => REQUESTERS)
    renderSelect()

    const continueButton = await screen.findByRole('button', { name: /continue/i })
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(continueButton).toBeDisabled()

    await userEvent.selectOptions(screen.getByRole('combobox'), 'Jennifer Anderson')
    expect(continueButton).toBeEnabled()
  })

  it('shows an empty state when no active requesters exist', async () => {
    mockFetch(() => [])
    renderSelect()

    await waitFor(() =>
      expect(screen.getByText(/no active development requesters/i)).toBeInTheDocument(),
    )
  })

  it('shows a failure state when the API call fails', async () => {
    mockFetch(() => null)
    renderSelect()

    await waitFor(() =>
      expect(screen.getByText(/unable to load development requesters/i)).toBeInTheDocument(),
    )
  })
})

// UI-02 (BR-04): selecting a requester persists it to localStorage so a
// fresh mount (simulating a page reload) sees the same requester without
// showing the selector again.
describe('UI-02 selection persists across a simulated reload', () => {
  it('writes the selected requester to localStorage on Continue', async () => {
    mockFetch(() => REQUESTERS)
    const { unmount } = renderSelect()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument(),
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Jennifer Anderson')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    const stored = window.localStorage.getItem('toktickit.selectedRequester')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toMatchObject({ id: 1, name: 'Jennifer Anderson' })

    unmount()
  })
})
