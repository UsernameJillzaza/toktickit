import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffActions, RequesterActions } from '../../src/actions/ActionsTaken'
import type { ActionTaken } from '../../src/actions/ActionsTaken'

// UI-01 … UI-08: the Actions Taken area on the Staff and Requester Ticket
// Detail screens (ui-spec §5, §6). The component is rendered on its own with a
// stubbed API; the full screen is covered by TicketWorkflow.test.tsx and E2E.

const STAFF = [
  { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF' as const },
  { id: 9, name: 'Nok Admin', role: 'ADMIN' as const },
]

function action(overrides: Partial<ActionTaken> = {}): ActionTaken {
  return {
    id: 41,
    ticketId: 12,
    actionAt: '2026-11-01T08:30:00.000Z',
    description: 'Replaced the HDMI switcher in room 401',
    result: null,
    status: 'OPEN',
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    version: 1,
    performedBy: { id: 8, name: 'Arthit Wongsa', role: 'IT_STAFF' },
    createdBy: { id: 8, name: 'Arthit Wongsa' },
    ...overrides,
  }
}

type Reply = { status: number; body: unknown }
type Call = { url: string; method: string; body: Record<string, unknown> | null }

/** Answers GET with `list`; every write goes to `write`, which may be async or throw to mimic a network failure. */
function stubApi(list: ActionTaken[], opts: { workable?: boolean; write?: (call: Call) => Reply | Promise<Reply> } = {}) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const call: Call = { url, method, body: init?.body ? JSON.parse(String(init.body)) : null }
    calls.push(call)
    const reply: Reply =
      method === 'GET'
        ? { status: 200, body: url.startsWith('/api/staff/') ? { ticketStatus: 'IN_PROGRESS', workable: opts.workable ?? true, actions: list } : { actions: list } }
        : await (opts.write ?? (() => ({ status: 500, body: {} })))(call)
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, writes: () => calls.filter((c) => c.method !== 'GET') }
}

afterEach(() => vi.unstubAllGlobals())

const renderStaff = (onChanged = vi.fn()) => {
  render(<StaffActions ticketId={12} meId={8} assignees={STAFF} onChanged={onChanged} />)
  return onChanged
}
const region = () => screen.findByRole('region', { name: /actions taken/i })

async function openCreate() {
  await userEvent.click(await screen.findByRole('button', { name: 'New action' }))
  return screen.getByRole('form', { name: 'Save action' })
}

// UI-01 (FR-02, AC-11, AC-12)
describe('UI-01 the Actions list states', () => {
  it('lists every field of each Action, in the order returned, with counts in the heading', async () => {
    stubApi([
      action({ id: 1, description: 'First: checked the cable', status: 'COMPLETED', result: 'Cable was fine', version: 2 }),
      action({
        id: 2,
        description: 'Second: replaced the switcher',
        followUpRequired: true,
        followUpNote: 'Look again on Monday',
        attachmentNotes: 'Photo in folder 401',
        performedBy: { id: 9, name: 'Nok Admin', role: 'ADMIN' },
      }),
    ])
    renderStaff()
    const ops = await region()
    expect(await within(ops).findByText('First: checked the cable')).toBeInTheDocument()
    const items = within(ops).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('First: checked the cable')
    expect(items[1]).toHaveTextContent('Second: replaced the switcher')
    expect(items[0]).toHaveTextContent('✓ Completed')
    expect(items[0]).toHaveTextContent('Result: Cable was fine')
    expect(items[1]).toHaveTextContent('Nok Admin')
    expect(items[1]).toHaveTextContent('Administrator')
    expect(items[1]).toHaveTextContent('! Follow-up needed')
    expect(items[1]).toHaveTextContent('Follow-up: Look again on Monday')
    expect(items[1]).toHaveTextContent('Attachment notes: Photo in folder 401')
    expect(within(ops).getByRole('heading', { name: /1 completed, 1 open/ })).toBeInTheDocument()
  })

  it('shows the empty sentence', async () => {
    stubApi([])
    renderStaff()
    expect(await screen.findByText('No actions taken yet.')).toBeInTheDocument()
  })

  it('shows Loading while the list is on its way, and marks the region busy', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderStaff()
    const ops = await region()
    expect(within(ops).getByText('Loading…')).toBeInTheDocument()
    expect(ops).toHaveAttribute('aria-busy', 'true')
  })

  it('shows a failure with Retry, and Retry loads the list', async () => {
    let fail = true
    const fetchMock = vi.fn(async () =>
      fail ? ({ ok: false, status: 500, json: async () => ({}) }) : ({ ok: true, status: 200, json: async () => ({ workable: true, actions: [action()] }) }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderStaff()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the actions.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Replaced the HDMI switcher in room 401')).toBeInTheDocument()
  })
})

// UI-02 (BR-04, BR-06, AC-03, AC-36)
describe('UI-02 the create form', () => {
  it('shows a message under the empty required field, moves focus to it, and sends nothing', async () => {
    const api = stubApi([])
    renderStaff()
    const form = await openCreate()
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))

    const description = within(form).getByLabelText('Description')
    const message = within(form).getByText('Description is required.')
    expect(description).toHaveAttribute('aria-invalid', 'true')
    expect(description).toHaveAccessibleDescription('Description is required.')
    expect(message).toBeInTheDocument()
    expect(description).toHaveFocus()
    expect(api.writes()).toHaveLength(0)
  })

  it('shows the follow-up note only when ticked, requires it then, and drops it when unticked', async () => {
    const api = stubApi([])
    renderStaff()
    const form = await openCreate()
    expect(within(form).queryByLabelText('Follow-up note')).not.toBeInTheDocument()

    await userEvent.type(within(form).getByLabelText('Description'), 'Swapped the cable')
    await userEvent.click(within(form).getByLabelText('Follow-up required'))
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))
    expect(within(form).getByText('A follow-up note is required when follow-up is needed.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Follow-up note')).toHaveFocus()
    expect(api.writes()).toHaveLength(0)

    await userEvent.click(within(form).getByLabelText('Follow-up required'))
    expect(within(form).queryByLabelText('Follow-up note')).not.toBeInTheDocument()
  })

  it('counts characters, not UTF-16 units, in the counter and the limit', async () => {
    stubApi([])
    renderStaff()
    const form = await openCreate()
    await userEvent.type(within(form).getByLabelText('Description'), '😀😀')
    expect(within(form).getByText('2 / 2000')).toBeInTheDocument()
  })

  it('keeps every typed value when the network fails, and says so above the buttons', async () => {
    stubApi([], { write: () => { throw new Error('offline') } })
    renderStaff()
    const form = await openCreate()
    await userEvent.type(within(form).getByLabelText('Description'), 'Swapped the cable')
    await userEvent.type(within(form).getByLabelText('Attachment notes'), 'Photo on the drive')
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Unable to reach the server. Please try again.')
    expect(within(form).getByLabelText('Description')).toHaveValue('Swapped the cable')
    expect(within(form).getByLabelText('Attachment notes')).toHaveValue('Photo on the drive')
    expect(within(form).getByRole('button', { name: 'Save action' })).toBeEnabled()
  })

  it('sends the key, the description and the performer, then refreshes the list and tells the screen', async () => {
    const created = action({ id: 77, description: 'Swapped the cable' })
    const list: ActionTaken[] = []
    const api = stubApi(list, {
      write: () => {
        list.push(created)
        return { status: 201, body: created }
      },
    })
    const onChanged = renderStaff()
    const form = await openCreate()
    await userEvent.type(within(form).getByLabelText('Description'), '  Swapped the cable  ')
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(await screen.findAllByText('Swapped the cable')).not.toHaveLength(0)
    const [post] = api.writes()
    expect(post.method).toBe('POST')
    expect(post.url).toBe('/api/staff/tickets/12/actions')
    expect(post.body).toMatchObject({ description: 'Swapped the cable', performedById: 8, followUpRequired: false })
    expect(typeof post.body!.requestKey).toBe('string')
    expect(post.body).not.toHaveProperty('followUpNote')
    expect(post.body).not.toHaveProperty('status')
    expect(onChanged).toHaveBeenCalled()
    expect(screen.queryByRole('form', { name: 'Save action' })).not.toBeInTheDocument()
  })
})

// UI-03 (BR-32, AC-35)
describe('UI-03 duplicate-click protection', () => {
  it('sends one request for a double click and shows Saving… while it runs', async () => {
    let release: (r: Reply) => void = () => {}
    const api = stubApi([], { write: () => new Promise<Reply>((resolve) => (release = resolve)) })
    renderStaff()
    const form = await openCreate()
    await userEvent.type(within(form).getByLabelText('Description'), 'Swapped the cable')
    const save = within(form).getByRole('button', { name: 'Save action' })
    await userEvent.dblClick(save)
    fireEvent.submit(form)

    expect(within(form).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(api.writes()).toHaveLength(1)
    release({ status: 201, body: action({ id: 77 }) })
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Save action' })).not.toBeInTheDocument())
    expect(api.writes()).toHaveLength(1)
  })

  it('reuses the same requestKey when the same form is submitted again after a failure', async () => {
    let n = 0
    const api = stubApi([], { write: () => (++n === 1 ? { status: 500, body: { error: 'Something went wrong.' } } : { status: 201, body: action() }) })
    renderStaff()
    const form = await openCreate()
    await userEvent.type(within(form).getByLabelText('Description'), 'Swapped the cable')
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))
    await within(form).findByRole('alert')
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))
    await waitFor(() => expect(api.writes()).toHaveLength(2))
    expect(api.writes()[1].body!.requestKey).toBe(api.writes()[0].body!.requestKey)
  })
})

// UI-04 (BR-03, AC-04)
describe('UI-04 the performer', () => {
  it('lists the active staff, defaults to me, and shows PERFORMER_INVALID under the select', async () => {
    stubApi([], { write: () => ({ status: 400, body: { error: 'Choose an active IT Staff member or Administrator.', code: 'PERFORMER_INVALID', field: 'performedById' } }) })
    renderStaff()
    const form = await openCreate()
    const select = within(form).getByLabelText('Performed by')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Arthit Wongsa', 'Nok Admin'])
    expect(select).toHaveValue('8')

    await userEvent.selectOptions(select, '9')
    await userEvent.type(within(form).getByLabelText('Description'), 'Swapped the cable')
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))
    expect(await within(form).findByText('Choose an active IT Staff member or Administrator.')).toBeInTheDocument()
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveFocus()
  })
})

// UI-05 (FR-03 … FR-05, AC-05, 07, 08, 09)
describe('UI-05 edit, Complete and Cancel', () => {
  it('Edit sends the version it loaded and the changed fields', async () => {
    const api = stubApi([action({ version: 3 })], { write: () => ({ status: 200, body: action({ version: 4 }) }) })
    renderStaff()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit action 41' }))
    const form = screen.getByRole('form', { name: 'Save changes' })
    const description = within(form).getByLabelText('Description')
    expect(description).toHaveValue('Replaced the HDMI switcher in room 401')
    await userEvent.clear(description)
    await userEvent.type(description, 'Replaced the switcher and the cable')
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(api.writes()).toHaveLength(1))
    const [patch] = api.writes()
    expect(patch.method).toBe('PATCH')
    expect(patch.url).toBe('/api/staff/tickets/12/actions/41')
    expect(patch.body).toMatchObject({ version: 3, description: 'Replaced the switcher and the cable', performedById: 8 })
  })

  it('Complete needs a Result, then sends the version and the result', async () => {
    const api = stubApi([action({ version: 2 })], { write: () => ({ status: 200, body: action({ status: 'COMPLETED', version: 3 }) }) })
    const onChanged = renderStaff()
    await userEvent.click(await screen.findByRole('button', { name: 'Complete action 41' }))
    const panel = screen.getByRole('form', { name: 'Mark completed' })
    expect(within(panel).getByLabelText('Result')).toHaveFocus()

    await userEvent.click(within(panel).getByRole('button', { name: 'Mark completed' }))
    expect(within(panel).getByText('Result is required.')).toBeInTheDocument()
    expect(api.writes()).toHaveLength(0)

    await userEvent.type(within(panel).getByLabelText('Result'), 'Picture is back')
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark completed' }))
    await waitFor(() => expect(api.writes()).toHaveLength(1))
    expect(api.writes()[0]).toMatchObject({ method: 'POST', url: '/api/staff/tickets/12/actions/41/complete', body: { version: 2, result: 'Picture is back' } })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('Cancel asks for a Reason and sends it with the version', async () => {
    const api = stubApi([action({ version: 5 })], { write: () => ({ status: 200, body: action({ status: 'CANCELLED', version: 6 }) }) })
    renderStaff()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel action 41' }))
    const panel = screen.getByRole('form', { name: 'Cancel action' })
    await userEvent.type(within(panel).getByLabelText('Reason'), 'Nothing to replace')
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel action' }))
    await waitFor(() => expect(api.writes()).toHaveLength(1))
    expect(api.writes()[0]).toMatchObject({ url: '/api/staff/tickets/12/actions/41/cancel', body: { version: 5, result: 'Nothing to replace' } })
  })

  it('Completed and Cancelled Actions show no buttons at all', async () => {
    stubApi([
      action({ id: 1, status: 'COMPLETED', result: 'Done' }),
      action({ id: 2, status: 'CANCELLED', result: 'Not needed' }),
    ])
    renderStaff()
    const ops = await region()
    expect(await within(ops).findByText('Not needed')).toBeInTheDocument()
    const items = within(ops).getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('Reason: Not needed')
    expect(items[1]).toHaveTextContent('✕ Cancelled')
    for (const item of items) expect(within(item).queryAllByRole('button')).toHaveLength(0)
  })
})

// UI-06 (BR-15, AC-06, AC-36)
describe('UI-06 an edit on an out-of-date Action', () => {
  it('shows the banner with Reload, keeps the typed text, and drops it only on Reload', async () => {
    const api = stubApi([action({ version: 1 })], { write: () => ({ status: 409, body: { error: 'x', code: 'STALE_UPDATE' } }) })
    renderStaff()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit action 41' }))
    const form = screen.getByRole('form', { name: 'Save changes' })
    const description = within(form).getByLabelText('Description')
    await userEvent.clear(description)
    await userEvent.type(description, 'My unsaved wording')
    await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }))

    const banner = await within(form).findByRole('alert')
    expect(banner).toHaveTextContent('This action was changed by someone else. Reload to see the latest.')
    expect(description).toHaveValue('My unsaved wording')
    const getsBefore = api.calls.filter((c) => c.method === 'GET').length

    await userEvent.click(within(banner).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'GET').length).toBe(getsBefore + 1))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Save changes' })).not.toBeInTheDocument())
  })
})

// UI-07 (BR-11, AC-10)
describe('UI-07 a Ticket that cannot take Actions', () => {
  it('disables New action and says why in visible text', async () => {
    stubApi([action({ status: 'COMPLETED', result: 'Done' })], { workable: false })
    renderStaff()
    const button = await screen.findByRole('button', { name: 'New action' })
    await waitFor(() => expect(button).toBeDisabled())
    expect(screen.getByText('Reopen the ticket to add actions.')).toBeInTheDocument()
  })

  it('also locks the form when the server says TICKET_NOT_WORKABLE', async () => {
    stubApi([], { write: () => ({ status: 409, body: { error: 'This ticket is resolved, so actions cannot be added.', code: 'TICKET_NOT_WORKABLE' } }) })
    renderStaff()
    const form = await openCreate()
    await userEvent.type(within(form).getByLabelText('Description'), 'Swapped the cable')
    await userEvent.click(within(form).getByRole('button', { name: 'Save action' }))
    expect(await within(form).findByText('This ticket is resolved, so actions cannot be added.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New action' })).toBeDisabled()
    expect(screen.getByText('Reopen the ticket to add actions.')).toBeInTheDocument()
  })
})

// UI-08 (FR-07, AC-14, AC-16)
describe('UI-08 the Requester view', () => {
  it('is read-only: every field, no buttons, no form, no Internal Notes', async () => {
    const api = stubApi([
      action({ id: 1, status: 'COMPLETED', result: 'Picture is back', followUpRequired: true, followUpNote: 'Check Monday', attachmentNotes: 'Photo in folder 401', version: 2 }),
      action({ id: 2, description: 'Ordered a spare cable' }),
    ])
    render(<RequesterActions ticketId={12} />)
    const section = await screen.findByRole('region', { name: 'Work done on your ticket' })
    expect(await within(section).findByText('Ordered a spare cable')).toBeInTheDocument()
    const first = within(section).getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('Replaced the HDMI switcher in room 401')
    expect(first).toHaveTextContent('Arthit Wongsa')
    expect(first).toHaveTextContent('✓ Completed')
    expect(first).toHaveTextContent('Result: Picture is back')
    expect(first).toHaveTextContent('Follow-up: Check Monday')
    expect(first).toHaveTextContent('Attachment notes: Photo in folder 401')
    expect(within(section).queryAllByRole('button')).toHaveLength(0)
    expect(within(section).queryByText(/internal note/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Visible to the requester/)).not.toBeInTheDocument()
    expect(api.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/tickets/12/actions'])
  })

  it('says so when nothing has been recorded, and offers Retry on failure', async () => {
    stubApi([])
    const { unmount } = render(<RequesterActions ticketId={12} />)
    expect(await screen.findByText('No actions have been recorded yet.')).toBeInTheDocument()
    unmount()

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    render(<RequesterActions ticketId={12} />)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
