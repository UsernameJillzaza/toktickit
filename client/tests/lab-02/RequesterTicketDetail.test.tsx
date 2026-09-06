import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequesterTicketDetail from '../../src/tickets/RequesterTicketDetail'
import { RequesterProvider } from '../../src/requester/RequesterContext'

const REQUESTER = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' }

const BASE_TICKET = {
  id: 1,
  ticketNumber: 'TKT-2026-000001',
  summary: 'Laptop battery drains quickly',
  description: 'The battery goes from 100% to 20% within an hour of normal use.',
  requestedPriority: 'MEDIUM',
  currentStatus: 'NEW',
  createdAt: '2026-09-01T00:00:00Z',
  category: { name: 'Hardware' },
  relatedSystem: { name: 'Corporate Laptop' },
  attachments: [] as unknown[],
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/tickets/1']}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.setItem('toktickit.selectedRequester', JSON.stringify(REQUESTER))
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

// UI-11 (§8.5): read-only fields, no editable inputs, no comments/Actions
// Taken UI — Lab 2 explicitly excludes those.
describe('UI-11 read-only Ticket Detail', () => {
  it('shows ticket fields as read-only text, with no comment/notes UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => BASE_TICKET })),
    )
    renderDetail()

    expect(await screen.findByText('TKT-2026-000001')).toBeInTheDocument()
    expect(screen.getByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /summary/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/public comment/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/actions taken/i)).not.toBeInTheDocument()
  })
})

// UI-06 (AC-05): an unsupported file type is rejected with a clear message.
describe('UI-06 invalid attachment type', () => {
  it('shows an error when the server rejects the file type', async () => {
    let uploadCalled = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url.includes('/attachments')) {
          uploadCalled = true
          return {
            ok: false,
            status: 400,
            json: async () => ({ error: 'Unsupported file type — only JPG, PNG, WEBP, and PDF are allowed' }),
          }
        }
        return { ok: true, status: 200, json: async () => BASE_TICKET }
      }),
    )
    renderDetail()

    const input = await screen.findByLabelText<HTMLInputElement>(/add attachment/i)
    const badFile = new File(['fake exe content'], 'tool.exe', { type: 'application/x-msdownload' })
    // userEvent.upload() respects the input's `accept` attribute like a real
    // file picker would, so it won't even let us "select" a mismatched type.
    // Firing the change event directly simulates the realistic bypass (drag
    // -and-drop, or a renamed extension) that server-side validation exists
    // to catch — the input's `accept` is UX sugar, not the real boundary.
    Object.defineProperty(input, 'files', { value: [badFile] })
    input.dispatchEvent(new Event('change', { bubbles: true }))

    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument()
    expect(uploadCalled).toBe(true)
  })
})

// UI-07 (AC-11): a removed attachment still shows its metadata, with
// Download disabled.
describe('UI-07 removed attachment display', () => {
  it('shows the removed attachment name but disables its Download button', async () => {
    const ticketWithRemoved = {
      ...BASE_TICKET,
      attachments: [
        {
          id: 5,
          filename: 'old-photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 20480,
          isRemoved: true,
          removedAt: '2026-09-02T00:00:00Z',
          createdAt: '2026-09-01T00:00:00Z',
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ticketWithRemoved })),
    )
    renderDetail()

    expect(await screen.findByText(/old-photo\.jpg/)).toBeInTheDocument()
    expect(screen.getByText(/\(Removed\)/i)).toBeInTheDocument()
    const downloadButtons = screen.getAllByRole('button', { name: /download/i })
    expect(downloadButtons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })
})

// Happy path: uploading a valid file re-loads the ticket and shows it in
// the active attachments list.
describe('Attachment upload happy path', () => {
  it('shows the new attachment after a successful upload', async () => {
    let ticketState = { ...BASE_TICKET }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url.includes('/attachments')) {
          ticketState = {
            ...ticketState,
            attachments: [
              {
                id: 9,
                filename: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 2048,
                isRemoved: false,
                removedAt: null,
                createdAt: '2026-09-03T00:00:00Z',
              },
            ],
          }
          return { ok: true, status: 201, json: async () => ({ id: 9 }) }
        }
        return { ok: true, status: 200, json: async () => ticketState }
      }),
    )
    renderDetail()

    await screen.findByText('No attachments yet.')
    const input = screen.getByLabelText(/add attachment/i)
    const goodFile = new File(['jpeg bytes'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(input, goodFile)

    expect(await screen.findByText(/photo\.jpg/)).toBeInTheDocument()
  })
})

// Removal flow: confirming with a valid reason calls the remove endpoint
// and reloads the ticket.
describe('Attachment removal flow', () => {
  it('requires a reason before Confirm is enabled, then removes the attachment', async () => {
    let removed = false
    const ticketState = {
      ...BASE_TICKET,
      attachments: [
        {
          id: 9,
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
          isRemoved: false,
          removedAt: null,
          createdAt: '2026-09-03T00:00:00Z',
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url.includes('/remove')) {
          removed = true
          return { ok: true, status: 200, json: async () => ({ id: 9, isRemoved: true }) }
        }
        return {
          ok: true,
          status: 200,
          json: async () => (removed ? { ...ticketState, attachments: [{ ...ticketState.attachments[0], isRemoved: true }] } : ticketState),
        }
      }),
    )
    renderDetail()

    await screen.findByText(/photo\.jpg/)
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }))

    const confirmButton = screen.getByRole('button', { name: /confirm/i })
    expect(confirmButton).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/removal reason/i), 'Uploaded the wrong file')
    expect(confirmButton).toBeEnabled()

    await userEvent.click(confirmButton)
    await waitFor(() => expect(removed).toBe(true))
  })
})
