import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequesterTicketDetail from '../../src/tickets/RequesterTicketDetail'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

const ME: AuthUser = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test', role: 'REQUESTER', mustChangePassword: false }

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    ticketNumber: 'TKT-2026-000007',
    summary: 'Wi-Fi drops in the library',
    description: 'Drops every few minutes.',
    requestedPriority: 'MEDIUM',
    currentStatus: 'IN_PROGRESS',
    requesterResolvedAt: null,
    createdAt: '2026-09-28T03:00:00.000Z',
    updatedAt: '2026-09-29T03:00:00.000Z',
    category: { name: 'Network' },
    relatedSystem: { name: 'Campus Wi-Fi' },
    owner: { name: 'Arthit Wongsa' },
    attachments: [],
    ...overrides,
  }
}

const STAFF_COMMENT = {
  id: 1,
  body: 'Looking into it now.',
  createdAt: '2026-09-29T04:00:00.000Z',
  author: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF' },
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function stubApi(initialTicket: Record<string, unknown>, comments: unknown[] = [STAFF_COMMENT]) {
  let list = [...comments]
  let current = initialTicket
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/tickets/7/comments' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)).body
      const created = { id: list.length + 10, body, createdAt: '2026-10-01T00:00:00.000Z', author: { id: ME.id, name: ME.name, role: 'REQUESTER' } }
      list = [...list, created]
      return jsonResponse(201, created)
    }
    if (url === '/api/tickets/7/comments') return jsonResponse(200, list)
    if (url === '/api/tickets/7/resolved-indication') {
      current = { ...current, requesterResolvedAt: '2026-10-01T05:00:00.000Z' }
      return jsonResponse(200, { id: 7, currentStatus: current.currentStatus, requesterResolvedAt: current.requesterResolvedAt })
    }
    if (url === '/api/tickets/7') return jsonResponse(200, current)
    return jsonResponse(404, { error: 'Not found' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/tickets/7']}>
      <AuthProvider initialUser={ME}>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('assignment line', () => {
  it('shows who the ticket is assigned to, or that nobody is yet', async () => {
    stubApi(ticket())
    renderDetail()
    expect(await screen.findByText('Arthit Wongsa', { selector: 'dd' })).toBeInTheDocument()
  })

  it('"Not yet assigned" without an owner', async () => {
    stubApi(ticket({ owner: null }))
    renderDetail()
    expect(await screen.findByText('Not yet assigned')).toBeInTheDocument()
  })
})

// UI-23 (AC-22, AC-25, BR-30)
describe('UI-23 public comments', () => {
  it('lists comments with author, role badge and time, and posts a new one', async () => {
    const fetchMock = stubApi(ticket())
    renderDetail()

    const section = await screen.findByRole('region', { name: /public comments/i })
    const first = await within(section).findByText('Looking into it now.')
    const item = first.closest('li')!
    expect(within(item).getByText('Arthit Wongsa')).toBeInTheDocument()
    expect(within(item).getByText('IT Staff')).toHaveClass('tt-badge-role-IT_STAFF')

    const box = within(section).getByLabelText('Add a public comment')
    await userEvent.type(box, 'Thanks, it is the second floor.')
    expect(within(section).getByText('31 / 2000')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: 'Post comment' }))

    expect(await within(section).findByText('Thanks, it is the second floor.')).toBeInTheDocument()
    expect(box).toHaveValue('')
    const post = fetchMock.mock.calls.find(([u, init]) => u === '/api/tickets/7/comments' && init?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toEqual({ body: 'Thanks, it is the second floor.' })
  })

  it('shows markup as plain text — no element is created from a comment', async () => {
    stubApi(ticket(), [{ ...STAFF_COMMENT, body: 'Try <b>restarting</b> <script>alert(1)</script>' }])
    const { container } = renderDetail()
    const section = await screen.findByRole('region', { name: /public comments/i })
    expect(await within(section).findByText('Try <b>restarting</b> <script>alert(1)</script>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('cannot post an empty comment', async () => {
    stubApi(ticket())
    renderDetail()
    const section = await screen.findByRole('region', { name: /public comments/i })
    expect(within(section).getByRole('button', { name: 'Post comment' })).toBeDisabled()
  })

  it('a closed ticket hides the form and explains why', async () => {
    stubApi(ticket({ currentStatus: 'CLOSED' }))
    renderDetail()
    const section = await screen.findByRole('region', { name: /public comments/i })
    expect(await within(section).findByText('This ticket is closed. New comments are disabled.')).toBeInTheDocument()
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument()
  })
})

// UI-24 (AC-26, BR-25)
describe('UI-24 "Problem Appears Resolved"', () => {
  it('is offered while the ticket is open, and becomes a confirmation after pressing', async () => {
    const fetchMock = stubApi(ticket())
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Problem Appears Resolved' }))

    expect(await screen.findByText(/you reported this problem as resolved on/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Problem Appears Resolved' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u, init]) => u === '/api/tickets/7/resolved-indication' && init?.method === 'POST')).toBe(true)
  })

  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'])('is not offered while %s', async (status) => {
    stubApi(ticket({ currentStatus: status }))
    renderDetail()
    await screen.findByText('TKT-2026-000007')
    expect(screen.queryByRole('button', { name: 'Problem Appears Resolved' })).not.toBeInTheDocument()
  })

  it('already reported → confirmation text instead of the button', async () => {
    stubApi(ticket({ requesterResolvedAt: '2026-09-30T03:00:00.000Z' }))
    renderDetail()
    expect(await screen.findByText(/you reported this problem as resolved on/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Problem Appears Resolved' })).not.toBeInTheDocument()
  })
})

// UI-25 (AC-23): nothing IT-only appears on the requester's screen.
describe('UI-25 no IT-only controls for requesters', () => {
  it('has no internal notes, IT priority or status controls', async () => {
    stubApi(ticket())
    renderDetail()
    await screen.findByText('TKT-2026-000007')
    await waitFor(() => expect(screen.getByRole('region', { name: /public comments/i })).toBeInTheDocument())
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/IT priority/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/change status/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
