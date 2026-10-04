import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StaffTicketDetail from '../../src/staff/StaffTicketDetail'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

const ME: AuthUser = { id: 8, name: 'Arthit Wongsa', email: 'arthit.wongsa@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }

const ASSIGNEES = [
  { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF' },
  { id: 11, name: 'Napat Chaiwong', role: 'ADMIN' },
]

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    ticketNumber: 'TKT-2026-000012',
    summary: 'VPN disconnects every 10 minutes',
    description: 'The VPN client reconnects roughly every ten minutes.',
    currentStatus: 'OPEN',
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    requesterResolvedAt: null,
    createdAt: '2026-09-28T03:00:00.000Z',
    updatedAt: '2026-10-01T03:00:00.000Z',
    category: { id: 4, name: 'Network' },
    relatedSystem: { id: 3, name: 'VPN' },
    requester: { id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test' },
    owner: null,
    attachments: [
      { id: 3, filename: 'vpn-log.png', mimeType: 'image/png', sizeBytes: 2048, isRemoved: false, removedAt: null, createdAt: '2026-09-28T03:05:00.000Z' },
      { id: 4, filename: 'old.png', mimeType: 'image/png', sizeBytes: 1024, isRemoved: true, removedAt: '2026-09-29T00:00:00.000Z', createdAt: '2026-09-28T03:06:00.000Z' },
    ],
    allowedTransitions: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    ...overrides,
  }
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined

function stubApi(initial: Record<string, unknown>, onMutation: Handler = () => undefined) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/staff/assignees') return jsonResponse(200, ASSIGNEES)
    if (init?.method === 'PUT') {
      const r = onMutation(url, init)
      if (r) return jsonResponse(r.status, r.body)
    }
    if (url === '/api/staff/tickets/12') return jsonResponse(200, initial)
    if (url === '/api/tickets/12/comments' || url === '/api/staff/tickets/12/notes') {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)).body
        return jsonResponse(201, { id: 99, body, createdAt: '2026-10-01T00:00:00.000Z', author: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF' } })
      }
      return jsonResponse(200, [])
    }
    return jsonResponse(404, { error: 'Not found', code: 'NOT_FOUND' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function putCalls(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init!.body)) }))
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets/12']}>
      <AuthProvider initialUser={ME}>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('ticket information', () => {
  it('shows the ticket read-only with requester, both priorities and attachments', async () => {
    stubApi(detail())
    renderDetail()

    expect(await screen.findByRole('heading', { name: /TKT-2026-000012/ })).toBeInTheDocument()
    expect(screen.getByText('VPN disconnects every 10 minutes')).toBeInTheDocument()
    expect(screen.getByText('Michael Brown')).toBeInTheDocument()
    expect(screen.getByText('michael.brown@toktickit.test')).toBeInTheDocument()
    expect(screen.getByText('Req. Medium')).toHaveClass('tt-badge-priority-MEDIUM')

    expect(screen.getByRole('link', { name: /vpn-log\.png/ })).toHaveAttribute('href', '/api/attachments/3/download')
    expect(screen.queryByRole('link', { name: /old\.png/ })).not.toBeInTheDocument()
    expect(screen.getByText(/old\.png/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /upload|remove/i })).not.toBeInTheDocument()
  })

  it('shows the "requester reported resolved" banner when set', async () => {
    stubApi(detail({ requesterResolvedAt: '2026-10-01T03:00:00.000Z' }))
    renderDetail()
    expect(await screen.findByText(/the requester reported this problem as resolved/i)).toBeInTheDocument()
  })
})

// UI-18 (AC-17)
describe('UI-18 claim', () => {
  it('Claim sends my id and then shows me as the owner', async () => {
    const fetchMock = stubApi(detail(), (url) =>
      url.endsWith('/owner') ? { status: 200, body: detail({ owner: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF', isActive: true } }) } : undefined,
    )
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    expect(within(ops).getByText('Unassigned', { selector: 'em' })).toBeInTheDocument()

    await userEvent.click(within(ops).getByRole('button', { name: 'Claim' }))

    await waitFor(() => expect(within(ops).getByText('Arthit Wongsa', { selector: 'strong' })).toBeInTheDocument())
    expect(putCalls(fetchMock)).toEqual([{ url: '/api/staff/tickets/12/owner', body: { ownerId: 8 } }])
    expect(within(ops).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('assigns to someone else, or unassigns, through the select', async () => {
    const fetchMock = stubApi(detail(), () => ({ status: 200, body: detail() }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })

    await userEvent.selectOptions(within(ops).getByLabelText('Assign to'), '11')
    await userEvent.click(within(ops).getByRole('button', { name: 'Save owner' }))
    await waitFor(() => expect(putCalls(fetchMock).at(-1)).toEqual({ url: '/api/staff/tickets/12/owner', body: { ownerId: 11 } }))
  })

  it('sets IT Priority', async () => {
    const fetchMock = stubApi(detail(), () => ({ status: 200, body: detail({ itPriority: 'CRITICAL' }) }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await userEvent.selectOptions(within(ops).getByLabelText('IT Priority'), 'CRITICAL')
    await userEvent.click(within(ops).getByRole('button', { name: 'Save priority' }))
    await waitFor(() => expect(putCalls(fetchMock).at(-1)).toEqual({ url: '/api/staff/tickets/12/it-priority', body: { itPriority: 'CRITICAL' } }))
  })
})

// UI-19 (AC-20, BR-24)
describe('UI-19 confirmation before Resolved / Closed / Cancelled', () => {
  it('offers only allowedTransitions in the status select', async () => {
    stubApi(detail())
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    const options = within(within(ops).getByLabelText('Change status')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Choose…', 'In Progress', 'Waiting for Requester', 'Resolved', 'Cancelled'])
  })

  it('Cancel in the dialog sends nothing; Confirm sends the change', async () => {
    const fetchMock = stubApi(detail({ owner: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF', isActive: true } }), () => ({
      status: 200,
      body: detail({ currentStatus: 'RESOLVED', allowedTransitions: ['CLOSED', 'REOPENED'] }),
    }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })

    await userEvent.selectOptions(within(ops).getByLabelText('Change status'), 'RESOLVED')
    await userEvent.click(within(ops).getByRole('button', { name: 'Save status' }))
    const dialog = await screen.findByRole('alertdialog', { name: /change status to resolved\?/i })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(putCalls(fetchMock)).toEqual([])

    await userEvent.click(within(ops).getByRole('button', { name: 'Save status' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(putCalls(fetchMock)).toEqual([{ url: '/api/staff/tickets/12/status', body: { status: 'RESOLVED' } }]))
  })

  it('a non-final status saves without a dialog', async () => {
    const fetchMock = stubApi(detail({ owner: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF', isActive: true } }), () => ({
      status: 200,
      body: detail({ currentStatus: 'IN_PROGRESS' }),
    }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await userEvent.selectOptions(within(ops).getByLabelText('Change status'), 'IN_PROGRESS')
    await userEvent.click(within(ops).getByRole('button', { name: 'Save status' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1))
  })
})

// UI-20 (AC-21, BR-20)
describe('UI-20 terminal ticket', () => {
  it('shows operations read-only with an explanation', async () => {
    stubApi(detail({ currentStatus: 'CLOSED', allowedTransitions: [], owner: { id: 11, name: 'Napat Chaiwong', role: 'ADMIN', isActive: true } }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    expect(within(ops).getByText(/this ticket is closed/i)).toBeInTheDocument()
    expect(within(ops).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(ops).queryByRole('button')).not.toBeInTheDocument()
    expect(within(ops).getByText('Napat Chaiwong')).toBeInTheDocument()
  })
})

// UI-22 (AC-19): a 409 is explained under the control that caused it, and
// the latest ticket is loaded again.
describe('UI-22 conflict from the API', () => {
  it('shows OWNER_REQUIRED under the status control and reloads the ticket', async () => {
    const fetchMock = stubApi(detail(), (url) =>
      url.endsWith('/status')
        ? { status: 409, body: { error: 'A ticket in IN_PROGRESS must have an owner.', code: 'OWNER_REQUIRED' } }
        : undefined,
    )
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await userEvent.selectOptions(within(ops).getByLabelText('Change status'), 'IN_PROGRESS')
    await userEvent.click(within(ops).getByRole('button', { name: 'Save status' }))

    expect(await within(ops).findByText('A ticket in IN_PROGRESS must have an owner.')).toBeInTheDocument()
    const loads = fetchMock.mock.calls.filter(([u, init]) => u === '/api/staff/tickets/12' && !init?.method)
    expect(loads.length).toBeGreaterThanOrEqual(2)
  })
})

// UI-21 (AC-36, ui-spec §9): public and internal are separate cards with
// separate forms and differently styled buttons, so a note can't be posted
// publicly by accident.
describe('UI-21 public comments vs internal notes', () => {
  it('renders two separate cards, each posting to its own endpoint', async () => {
    const fetchMock = stubApi(detail())
    renderDetail()

    const publicCard = await screen.findByRole('region', { name: /public comments — visible to the requester/i })
    const notesCard = screen.getByRole('region', { name: /internal notes — it staff and administrators only/i })
    expect(notesCard).toHaveClass('tt-internal-note')
    expect(publicCard).not.toHaveClass('tt-internal-note')
    expect(publicCard).not.toContainElement(notesCard)

    const publicButton = within(publicCard).getByRole('button', { name: 'Post public comment' })
    const noteButton = within(notesCard).getByRole('button', { name: 'Add internal note' })
    expect(publicButton).toHaveClass('btn-success')
    expect(noteButton).toHaveClass('btn-outline-warning')

    await userEvent.type(within(notesCard).getByRole('textbox'), 'Check the VPN certificate first.')
    await userEvent.click(noteButton)
    expect(await within(notesCard).findByText('Check the VPN certificate first.')).toBeInTheDocument()
    expect(within(publicCard).queryByText('Check the VPN certificate first.')).not.toBeInTheDocument()

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([u]) => u)
    expect(posts).toEqual(['/api/staff/tickets/12/notes'])
  })
})

// Regression found by E2E-05: React StrictMode (dev) mounts twice, so the
// ticket is fetched twice. When the second, identical response arrived after
// the user had picked a status, the controls were reset and Save was
// disabled. A refetch of an unchanged ticket must keep the user's choice.
describe('refetch of an unchanged ticket', () => {
  it('keeps the status the user just picked', async () => {
    let releaseSecond!: () => void
    let ticketCalls = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/staff/assignees') return jsonResponse(200, ASSIGNEES)
      if (url === '/api/tickets/12/comments' || url === '/api/staff/tickets/12/notes') return jsonResponse(200, [])
      if (init?.method === 'PUT') return jsonResponse(200, detail({ currentStatus: 'IN_PROGRESS', updatedAt: '2026-10-02T00:00:00.000Z' }))
      if (url === '/api/staff/tickets/12') {
        ticketCalls++
        if (ticketCalls === 2) await new Promise<void>((r) => (releaseSecond = r))
        return jsonResponse(200, detail({ owner: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF', isActive: true } }))
      }
      return jsonResponse(404, {})
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/staff/tickets/12']}>
          <AuthProvider initialUser={ME}>
            <Routes>
              <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    )
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await waitFor(() => expect(ticketCalls).toBe(2))
    await userEvent.selectOptions(within(ops).getByLabelText('Change status'), 'IN_PROGRESS')
    releaseSecond()
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u === '/api/staff/tickets/12')).toHaveLength(2))
    await new Promise((r) => setTimeout(r, 50))

    expect(within(ops).getByLabelText('Change status')).toHaveValue('IN_PROGRESS')
    expect(within(ops).getByRole('button', { name: 'Save status' })).toBeEnabled()
  })
})

describe('missing ticket', () => {
  it('shows Not Found for an unknown id', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/staff/assignees' ? jsonResponse(200, ASSIGNEES) : jsonResponse(404, { error: 'Ticket not found', code: 'NOT_FOUND' }))))
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
