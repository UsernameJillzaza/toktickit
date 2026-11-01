import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StaffTicketDetail from '../../src/staff/StaffTicketDetail'
import { AuthProvider } from '../../src/auth/AuthContext'
import type { AuthUser } from '../../src/auth/AuthContext'

// The Staff Ticket Detail screen's side of the Lab 4 status rules
// (BR-23, BR-19). L4-3 wires the request; L4-4 builds the resolution hint and
// the Reload button on top of these tests.

const ME: AuthUser = { id: 8, name: 'Arthit Wongsa', email: 'arthit.wongsa@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }

const FIRST_STAMP = '2026-11-01T03:00:00.000Z'
const NEWER_STAMP = '2026-11-01T03:05:00.000Z'

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    ticketNumber: 'TKT-2026-000012',
    summary: 'VPN disconnects every 10 minutes',
    description: 'The VPN client reconnects roughly every ten minutes.',
    currentStatus: 'IN_PROGRESS',
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    requesterResolvedAt: null,
    createdAt: '2026-10-28T03:00:00.000Z',
    updatedAt: FIRST_STAMP,
    category: { id: 4, name: 'Network' },
    relatedSystem: { id: 3, name: 'VPN' },
    requester: { id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test' },
    owner: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF', isActive: true },
    attachments: [],
    allowedTransitions: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    ...overrides,
  }
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

/** `loads` are the answers to successive GETs of the ticket; the last one repeats. */
function stubApi(loads: Array<Record<string, unknown>>, onStatus?: () => { status: number; body: unknown }) {
  let loadNo = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/staff/assignees') return json(200, [{ id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF' }])
    if (init?.method === 'PUT' && url.endsWith('/status') && onStatus) {
      const r = onStatus()
      return json(r.status, r.body)
    }
    if (url === '/api/staff/tickets/12' && !init?.method) return json(200, loads[Math.min(loadNo++, loads.length - 1)])
    if (init?.method === 'POST' && (url === '/api/staff/tickets/12/notes' || url === '/api/tickets/12/comments')) {
      return json(201, { id: 99, body: JSON.parse(String(init.body)).body, createdAt: NEWER_STAMP, author: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF' } })
    }
    if (url === '/api/staff/tickets/12/notes' || url === '/api/tickets/12/comments') return json(200, [])
    return json(404, { error: 'Not found', code: 'NOT_FOUND' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const statusPuts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .filter(([url, init]) => init?.method === 'PUT' && String(url).endsWith('/status'))
    .map(([, init]) => JSON.parse(String(init!.body)))
const ticketLoads = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([u, init]) => u === '/api/staff/tickets/12' && !init?.method).length

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

async function chooseStatus(ops: HTMLElement, value: string) {
  await userEvent.selectOptions(within(ops).getByLabelText('Change status'), value)
  await userEvent.click(within(ops).getByRole('button', { name: 'Save status' }))
}

// UI-11, first half (BR-23, AC-22): the status request names the updatedAt the
// user saw. The Reload button and the kept choice come with L4-4.
describe('UI-11 the status request carries expectedUpdatedAt', () => {
  it('sends the updatedAt of the ticket on screen, with no confirmation for a non-final status', async () => {
    const fetchMock = stubApi([detail()], () => ({ status: 200, body: detail({ currentStatus: 'WAITING_FOR_REQUESTER', updatedAt: NEWER_STAMP }) }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await chooseStatus(ops, 'WAITING_FOR_REQUESTER')
    await waitFor(() => expect(statusPuts(fetchMock)).toEqual([{ status: 'WAITING_FOR_REQUESTER', expectedUpdatedAt: FIRST_STAMP }]))
  })

  it('also sends it after the confirmation dialog of a final status', async () => {
    const fetchMock = stubApi([detail()], () => ({ status: 200, body: detail({ currentStatus: 'RESOLVED', updatedAt: NEWER_STAMP, allowedTransitions: ['CLOSED', 'REOPENED'] }) }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await chooseStatus(ops, 'RESOLVED')
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(statusPuts(fetchMock)).toEqual([{ status: 'RESOLVED', expectedUpdatedAt: FIRST_STAMP }]))
  })

  it('shows a stale-update answer with Reload, keeps the choice, and loads the latest ticket only on Reload', async () => {
    const fetchMock = stubApi([detail(), detail({ updatedAt: NEWER_STAMP })], () => ({ status: 409, body: { error: 'This ticket was changed by someone else. Reload to see the latest.', code: 'STALE_UPDATE' } }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await chooseStatus(ops, 'WAITING_FOR_REQUESTER')
    expect(await within(ops).findByText('This ticket changed. Reload to continue.')).toBeInTheDocument()
    expect(within(ops).getByLabelText('Change status')).toHaveValue('WAITING_FOR_REQUESTER') // choice kept
    expect(ticketLoads(fetchMock)).toBe(1) // nothing reloaded behind the user's back

    await userEvent.click(within(ops).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(ticketLoads(fetchMock)).toBe(2))
    expect(within(ops).queryByText('This ticket changed. Reload to continue.')).not.toBeInTheDocument()
  })

  it('shows the gate’s answer with its reasons in plain words', async () => {
    const message = 'This ticket cannot be resolved yet: it still has an open action.'
    stubApi([detail()], () => ({ status: 409, body: { error: message, code: 'RESOLUTION_BLOCKED', reasons: ['OPEN_ACTIONS'] } }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await chooseStatus(ops, 'RESOLVED')
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    expect(await within(ops).findByText(message)).toBeInTheDocument()
  })
})

// The risk this guards: posting a note moves the ticket's Last Updated, so a
// screen that kept the old value would refuse the same person's next status
// change as "stale".
describe('UI-11 the screen keeps its updatedAt current after the user’s own posts', () => {
  it.each([
    ['an internal note', 'New internal note', 'Add internal note'],
    ['a public comment', 'New public comment', 'Post public comment'],
  ])('after %s the ticket is loaded again and the next status change uses the new value', async (_label, inputLabel, submitLabel) => {
    const fetchMock = stubApi([detail(), detail({ updatedAt: NEWER_STAMP })], () => ({
      status: 200,
      body: detail({ currentStatus: 'WAITING_FOR_REQUESTER', updatedAt: '2026-11-01T03:10:00.000Z' }),
    }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    expect(ticketLoads(fetchMock)).toBe(1)

    await userEvent.type(screen.getByLabelText(inputLabel), 'Working on it')
    await userEvent.click(screen.getByRole('button', { name: submitLabel }))
    await waitFor(() => expect(ticketLoads(fetchMock)).toBe(2))

    await chooseStatus(await screen.findByRole('region', { name: 'Operations' }), 'WAITING_FOR_REQUESTER')
    await waitFor(() => expect(statusPuts(fetchMock)).toEqual([{ status: 'WAITING_FOR_REQUESTER', expectedUpdatedAt: NEWER_STAMP }]))
    expect(ops).toBeTruthy()
  })
})

// Found by E2E-05 once the screen refreshed after the user's own post: the
// Operations card used to remount whenever updatedAt moved, which threw away a
// status the user had just picked. It must remount only when what its controls
// show (status, owner, IT priority) really changed.
describe('UI-11 a refetch that only moves updatedAt keeps what the user picked', () => {
  it('keeps the pending status, and the save then carries the newer updatedAt', async () => {
    const fetchMock = stubApi([detail(), detail({ updatedAt: NEWER_STAMP })], () => ({
      status: 200,
      body: detail({ currentStatus: 'WAITING_FOR_REQUESTER', updatedAt: '2026-11-01T03:10:00.000Z' }),
    }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await userEvent.selectOptions(within(ops).getByLabelText('Change status'), 'WAITING_FOR_REQUESTER')

    await userEvent.type(screen.getByLabelText('New internal note'), 'Asked the requester for the log file')
    await userEvent.click(screen.getByRole('button', { name: 'Add internal note' }))
    await waitFor(() => expect(ticketLoads(fetchMock)).toBe(2))
    await new Promise((r) => setTimeout(r, 50)) // let the refetched ticket render

    const same = screen.getByRole('region', { name: 'Operations' })
    expect(same).toBe(ops) // not remounted
    expect(within(same).getByLabelText('Change status')).toHaveValue('WAITING_FOR_REQUESTER')
    await userEvent.click(within(same).getByRole('button', { name: 'Save status' }))
    await waitFor(() => expect(statusPuts(fetchMock)).toEqual([{ status: 'WAITING_FOR_REQUESTER', expectedUpdatedAt: NEWER_STAMP }]))
  })

  it('still resets the controls when Reload shows the status really changed under the user', async () => {
    stubApi([detail(), detail({ currentStatus: 'WAITING_FOR_REQUESTER', updatedAt: NEWER_STAMP, allowedTransitions: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'] })], () => ({ status: 409, body: { error: 'x', code: 'STALE_UPDATE' } }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await chooseStatus(ops, 'RESOLVED')
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await userEvent.click(await within(ops).findByRole('button', { name: 'Reload' }))
    const fresh = await screen.findByRole('region', { name: 'Operations' })
    await waitFor(() => expect(within(fresh).getByText('Status:').parentElement).toHaveTextContent('Waiting for Requester'))
    expect(within(fresh).getByLabelText('Change status')).toHaveValue('')
  })
})

// UI-09, UI-10, UI-12 (FR-08, FR-09, AC-18, AC-21, AC-24)
const BLOCKED = { canResolve: false, canCancel: false, reasons: ['NO_COMPLETED_ACTION'] }

describe('UI-09 the resolution hint and the status options', () => {
  it('offers exactly the options the API returned', async () => {
    stubApi([detail({ allowedTransitions: ['IN_PROGRESS', 'CANCELLED'] })])
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    const options = within(within(ops).getByLabelText('Change status')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Choose…', 'In Progress', 'Cancelled'])
  })

  it('explains why Resolved is not possible yet, with the specific reasons', async () => {
    stubApi([detail({ resolution: { ...BLOCKED, reasons: ['NO_COMPLETED_ACTION', 'OPEN_ACTIONS'] }, actionCounts: { open: 1, completed: 0, cancelled: 0 } })])
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    expect(within(ops).getByText('Resolved needs at least one completed action and no open actions.')).toBeInTheDocument()
    expect(within(ops).getByText('No action has been completed yet.')).toBeInTheDocument()
    expect(within(ops).getByText('1 action is still open.')).toBeInTheDocument()
    expect(within(ops).getByLabelText('Change status')).toHaveAccessibleDescription(/at least one completed action/)
  })

  it('shows no hint when the ticket can be resolved, or when Resolved is not an option', async () => {
    stubApi([detail({ resolution: { canResolve: true, canCancel: true, reasons: [] } })])
    const first = renderDetail()
    await screen.findByRole('region', { name: 'Operations' })
    expect(screen.queryByText(/Resolved needs at least one/)).not.toBeInTheDocument()
    first.unmount()

    stubApi([detail({ resolution: BLOCKED, allowedTransitions: ['IN_PROGRESS'] })])
    renderDetail()
    await screen.findByRole('region', { name: 'Operations' })
    expect(screen.queryByText(/Resolved needs at least one/)).not.toBeInTheDocument()
  })
})

describe('UI-10 a blocked status change', () => {
  it('shows the reasons next to the control and keeps the chosen status', async () => {
    const message = 'This ticket cannot be resolved yet: it has no completed action yet.'
    stubApi([detail()], () => ({ status: 409, body: { error: message, code: 'RESOLUTION_BLOCKED', reasons: ['NO_COMPLETED_ACTION'] } }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await chooseStatus(ops, 'RESOLVED')
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    expect(await within(ops).findByText(message)).toBeInTheDocument()
    expect(within(ops).getByLabelText('Change status')).toHaveValue('RESOLVED')
  })
})

describe('UI-12 a successful status change refreshes the summary', () => {
  it('updates the status badge, the options and the hint from the response', async () => {
    stubApi([detail()], () => ({
      status: 200,
      body: detail({ currentStatus: 'RESOLVED', updatedAt: NEWER_STAMP, allowedTransitions: ['CLOSED', 'REOPENED'], resolution: BLOCKED }),
    }))
    renderDetail()
    const ops = await screen.findByRole('region', { name: 'Operations' })
    await chooseStatus(ops, 'RESOLVED')
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    const fresh = await screen.findByRole('region', { name: 'Operations' })
    await waitFor(() => expect(within(fresh).getByText('Status:').parentElement).toHaveTextContent('Resolved'))
    const options = within(within(fresh).getByLabelText('Change status')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Choose…', 'Closed', 'Reopened'])
    expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0) // heading badge too
    expect(screen.queryByText(/Resolved needs at least one/)).not.toBeInTheDocument() // Resolved is no longer an option
  })
})
