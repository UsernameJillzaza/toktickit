import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useRequester } from '../requester/RequesterContext'

type Attachment = {
  id: number
  filename: string
  mimeType: string
  sizeBytes: number
  isRemoved: boolean
  removedAt: string | null
  createdAt: string
}

type TicketDetail = {
  id: number
  ticketNumber: string
  summary: string
  description: string
  requestedPriority: string
  currentStatus: string
  createdAt: string
  category: { name: string }
  relatedSystem: { name: string }
  attachments: Attachment[]
}

type LoadState = 'loading' | 'ready' | 'not-found' | 'failure'

// Lab 2 §8.5, Issue #18: Requester Ticket Detail — read-only Ticket fields
// plus the Attachment lifecycle (upload / download / soft-remove). No edit
// controls, no Public Comments / Internal Notes / Actions Taken (out of
// scope for Lab 2 — see specification.md Section 3 Excluded).
export default function RequesterTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { requester } = useRequester()

  const [state, setState] = useState<LoadState>('loading')
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [removalReason, setRemovalReason] = useState('')

  const load = useCallback(async () => {
    if (!requester) return
    setState('loading')
    try {
      const res = await fetch(`/api/tickets/${id}?requesterId=${requester.id}`)
      if (res.status === 404) {
        setState('not-found')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      setTicket(body)
      setState('ready')
    } catch {
      setState('failure')
    }
  }, [id, requester])

  useEffect(() => {
    load()
  }, [load])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !requester) return

    setUploadError(null)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/tickets/${id}/attachments?requesterId=${requester.id}`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      await load()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload attachment.')
    }
  }

  async function confirmRemove(attachmentId: number) {
    if (!requester || removalReason.trim().length < 5) return
    try {
      const res = await fetch(`/api/attachments/${attachmentId}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: requester.id, reason: removalReason.trim() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRemovingId(null)
      setRemovalReason('')
      await load()
    } catch {
      // Left visible so the Requester can retry; no destructive fallback needed.
    }
  }

  if (state === 'loading') {
    return (
      <main className="container py-5">
        <p role="status">⏳ Loading ticket…</p>
      </main>
    )
  }

  if (state === 'not-found') {
    return (
      <main className="container py-5">
        <div className="alert alert-warning" role="alert">
          Ticket not found.
        </div>
      </main>
    )
  }

  if (state === 'failure' || !ticket) {
    return (
      <main className="container py-5">
        <div className="alert alert-danger" role="alert">
          Unable to load this ticket. Please try again.
        </div>
      </main>
    )
  }

  const activeAttachments = ticket.attachments.filter((a) => !a.isRemoved)
  const removedAttachments = ticket.attachments.filter((a) => a.isRemoved)

  return (
    <main className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 fw-bold mb-4">Ticket Detail</h1>

      <dl className="row">
        <dt className="col-sm-4">Ticket Number</dt>
        <dd className="col-sm-8">{ticket.ticketNumber}</dd>

        <dt className="col-sm-4">Ticket Date</dt>
        <dd className="col-sm-8">{new Date(ticket.createdAt).toLocaleString()}</dd>

        <dt className="col-sm-4">Category</dt>
        <dd className="col-sm-8">{ticket.category.name}</dd>

        <dt className="col-sm-4">Related System</dt>
        <dd className="col-sm-8">{ticket.relatedSystem.name}</dd>

        <dt className="col-sm-4">Requested Priority</dt>
        <dd className="col-sm-8">
          <span className="badge bg-secondary">{ticket.requestedPriority}</span>
        </dd>

        <dt className="col-sm-4">Current Status</dt>
        <dd className="col-sm-8">
          <span className="badge bg-success">{ticket.currentStatus}</span>
        </dd>

        <dt className="col-sm-4">Summary</dt>
        <dd className="col-sm-8">{ticket.summary}</dd>

        <dt className="col-sm-4">Description</dt>
        <dd className="col-sm-8">{ticket.description}</dd>
      </dl>

      <hr className="my-4" />

      <h2 className="h5 mb-3">Attachments</h2>

      {uploadError && (
        <div className="alert alert-danger" role="alert">
          {uploadError}
        </div>
      )}

      <ul className="list-group mb-3">
        {activeAttachments.map((a) => (
          <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
            <span>
              {a.filename} <small className="text-secondary">({Math.round(a.sizeBytes / 1024)} KB)</small>
            </span>
            <span className="d-flex gap-2">
              <a
                className="btn btn-sm btn-outline-success"
                href={`/api/attachments/${a.id}/download?requesterId=${requester?.id}`}
              >
                Download
              </a>
              {removingId === a.id ? (
                <span className="d-flex gap-1">
                  <input
                    className="form-control form-control-sm"
                    placeholder="Reason (min. 5 characters)"
                    value={removalReason}
                    onChange={(e) => setRemovalReason(e.target.value)}
                    aria-label={`Removal reason for ${a.filename}`}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={removalReason.trim().length < 5}
                    onClick={() => confirmRemove(a.id)}
                  >
                    Confirm
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => {
                    setRemovingId(a.id)
                    setRemovalReason('')
                  }}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}

        {removedAttachments.map((a) => (
          <li
            key={a.id}
            className="list-group-item d-flex justify-content-between align-items-center text-secondary"
          >
            <span>
              {a.filename} <em>(Removed)</em>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled
              title="This attachment was removed and can no longer be downloaded."
            >
              Download
            </button>
          </li>
        ))}

        {ticket.attachments.length === 0 && <li className="list-group-item">No attachments yet.</li>}
      </ul>

      <label htmlFor="attachment-upload" className="form-label">
        Add attachment
      </label>
      <input
        id="attachment-upload"
        type="file"
        className="form-control"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleUpload}
      />
    </main>
  )
}
