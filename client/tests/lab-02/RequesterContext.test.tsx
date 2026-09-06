import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

const STORAGE_KEY = 'toktickit.selectedRequester'

beforeEach(() => {
  window.localStorage.clear()
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
}

// Requested change: readStoredRequester() must not trust arbitrary JSON —
// only a value shaped like a real Requester should count as "selected".
describe('RequesterContext — malformed localStorage fails safe', () => {
  it('treats `{}` as no selection, not as a selected requester', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({}))
    renderApp()
    // No requester → RequireRequester redirects to the selector, which
    // shows this explanatory text (see RequesterSelect.tsx).
    expect(screen.getByText(/this is not a login screen/i)).toBeInTheDocument()
  })

  it('treats a non-object value (e.g. an array) as no selection', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]))
    renderApp()
    expect(screen.getByText(/this is not a login screen/i)).toBeInTheDocument()
  })

  it('still accepts a well-formed stored requester', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' }),
    )
    renderApp()
    expect(screen.getByText('Jennifer Anderson')).toBeInTheDocument()
  })
})
