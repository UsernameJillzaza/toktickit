import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/AuthContext'
import { PriorityBadge, RoleBadge, StatusBadge } from '../components/Badges'
import { PRIORITY_LABELS, STATUS_LABELS } from '../components/labels'
import { Forbidden, NotFound } from '../components/StatusPages'
import type { Role } from '../auth/AuthContext'

type Owner = { id: number; name: string; role: Role; isActive: boolean }
type Attachment = { id: number; filename: string; sizeBytes: number; isRemoved: boolean }

export type StaffTicket = {
  id: number
  ticketNumber: string
  summary: string
  description: string
  currentStatus: string
  requestedPriority: string
  itPriority: string
  requesterResolvedAt: string | null
  createdAt: string
  category: { name: string }
  relatedSystem: { name: string }
  requester: { name: string; email: string }
  owner: Owner | null
  attachments: Attachment[]
  allowedTransitions: string[]
}

type Assignee = { id: number; name: string; role: Role }
type Control = 'owner' | 'priority' | 'status'
type LoadState = 'loading' | 'ready' | 'failure' | 'not-found' | 'forbidden'

// BR-24: these need an explicit confirmation before saving.
const CONFIRM: Record<string, string> = {
  RESOLVED: 'The requester will see the ticket as resolved. It can still be reopened or closed afterwards.',
  CLOSED: 'Closing is final: owner, IT priority and status can no longer change, and no new public comments can be added.',
  CANCELLED: 'Cancelling is final: owner, IT priority and status can no longer change, and no new public comments can be added.',
}

const formatDate = (iso: string) => new Date(iso).toLocaleString()

// FR-12 … FR-15 / ui-spec §9. Status options come from the API's
// allowedTransitions; this screen never keeps its own copy of the matrix.
export default function StaffTicketDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [ticket, setTicket] = useState<StaffTicket | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [assignees, setAssignees] = useState<Assignee[]>([])

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/staff/tickets/${id}`)
      if (res.status === 404) return setState('not-found')
      if (res.status === 403) return setState('forbidden')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTicket(await res.json())
      setState('ready')
    } catch {
      setState((s) => (s === 'ready' ? s : 'failure'))
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/staff/assignees')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Assignee[]) => {
        if (!cancelled) setAssignees(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'not-found') return <NotFound />
  if (state === 'forbidden') return <Forbidden />
  if (state === 'loading') {
    return (
      <div className="container py-5 text-center text-secondary" role="status">
        Loading ticket…
      </div>
    )
  }
  if (state === 'failure' || !ticket) {
    return (
      <main className="container py-4">
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>We couldn't load this ticket.</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
            Retry
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="container py-4">
      <p className="mb-2">
        <Link to="/staff/queue">← Ticket Queue</Link>
      </p>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h3 mb-0">{ticket.ticketNumber}</h1>
        <StatusBadge status={ticket.currentStatus} />
        <PriorityBadge priority={ticket.itPriority} prefix="IT" />
      </div>

      {ticket.requesterResolvedAt && (
        <div className="alert alert-success py-2">
          ✓ The requester reported this problem as resolved on {formatDate(ticket.requesterResolvedAt)}.
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-8 order-1">
          <TicketInfo ticket={ticket} />
        </div>
        <div className="col-lg-4 order-2">
          <OperationsCard
            ticket={ticket}
            meId={user!.id}
            assignees={assignees}
            onSaved={setTicket}
            reload={load}
          />
        </div>
        <div className="col-lg-8 order-3">
          <AttachmentsCard attachments={ticket.attachments} />
        </div>
      </div>
    </main>
  )
}

function TicketInfo({ ticket }: { ticket: StaffTicket }) {
  return (
    <section className="card shadow-sm" aria-labelledby="ticket-info-heading">
      <div className="card-body">
        <h2 id="ticket-info-heading" className="h5">
          {ticket.summary}
        </h2>
        <dl className="row mb-3 small">
          <dt className="col-sm-4 text-secondary">Requester</dt>
          <dd className="col-sm-8">
            <div>{ticket.requester.name}</div>
            <div className="text-secondary">{ticket.requester.email}</div>
          </dd>
          <dt className="col-sm-4 text-secondary">Created</dt>
          <dd className="col-sm-8">{formatDate(ticket.createdAt)}</dd>
          <dt className="col-sm-4 text-secondary">Category</dt>
          <dd className="col-sm-8">{ticket.category.name}</dd>
          <dt className="col-sm-4 text-secondary">Related system</dt>
          <dd className="col-sm-8">{ticket.relatedSystem.name}</dd>
          <dt className="col-sm-4 text-secondary">Requested priority</dt>
          <dd className="col-sm-8">
            <PriorityBadge priority={ticket.requestedPriority} prefix="Req." />
          </dd>
        </dl>
        <h3 className="h6 text-secondary">Description</h3>
        <p className="tt-pre-wrap mb-0">{ticket.description}</p>
      </div>
    </section>
  )
}

function AttachmentsCard({ attachments }: { attachments: Attachment[] }) {
  return (
    <section className="card shadow-sm" aria-labelledby="attachments-heading">
      <div className="card-body">
        <h2 id="attachments-heading" className="h6">
          Attachments
        </h2>
        {attachments.length === 0 ? (
          <p className="text-secondary mb-0">No attachments.</p>
        ) : (
          <ul className="list-unstyled mb-0">
            {attachments.map((a) => (
              <li key={a.id} className="py-1">
                {a.isRemoved ? (
                  <span className="text-secondary opacity-75">
                    {a.filename} <small>(removed by the requester)</small>
                  </span>
                ) : (
                  <a href={`/api/attachments/${a.id}/download`}>
                    {a.filename} <small className="text-secondary">({Math.max(1, Math.round(a.sizeBytes / 1024))} KB)</small>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

type OperationsProps = {
  ticket: StaffTicket
  meId: number
  assignees: Assignee[]
  onSaved: (ticket: StaffTicket) => void
  reload: () => Promise<void>
}

function OperationsCard({ ticket, meId, assignees, onSaved, reload }: OperationsProps) {
  const terminal = ticket.currentStatus === 'CLOSED' || ticket.currentStatus === 'CANCELLED'
  const [ownerChoice, setOwnerChoice] = useState(ticket.owner ? String(ticket.owner.id) : '')
  const [priorityChoice, setPriorityChoice] = useState(ticket.itPriority)
  const [statusChoice, setStatusChoice] = useState('')
  const [busy, setBusy] = useState<Control | null>(null)
  const [errors, setErrors] = useState<Partial<Record<Control, string>>>({})
  const [confirming, setConfirming] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Keep the controls in step with the latest ticket (after a save or reload).
  useEffect(() => {
    setOwnerChoice(ticket.owner ? String(ticket.owner.id) : '')
    setPriorityChoice(ticket.itPriority)
    setStatusChoice('')
  }, [ticket])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  async function save(control: Control, path: string, body: unknown) {
    setBusy(control)
    setErrors({})
    try {
      const res = await apiFetch(`/api/staff/tickets/${ticket.id}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors({ [control]: data.error ?? 'Could not save this change.' })
        // Someone else may have changed the ticket — show the latest state.
        if (res.status === 409) await reload()
        return
      }
      onSaved(data)
      setSaved(true)
    } catch {
      setErrors({ [control]: 'Unable to reach the server. Please try again.' })
    } finally {
      setBusy(null)
    }
  }

  function requestStatusChange() {
    if (!statusChoice) return
    if (CONFIRM[statusChoice]) setConfirming(statusChoice)
    else save('status', 'status', { status: statusChoice })
  }

  const ownerLine = ticket.owner ? (
    <span className="d-inline-flex flex-wrap align-items-center gap-1">
      <strong>{ticket.owner.name}</strong>
      <RoleBadge role={ticket.owner.role} />
      {!ticket.owner.isActive && <small className="text-secondary">(inactive)</small>}
    </span>
  ) : (
    <em className="text-secondary">Unassigned</em>
  )

  return (
    <section className="card shadow-sm" aria-labelledby="operations-heading">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center">
          <h2 id="operations-heading" className="h6 mb-0">
            Operations
          </h2>
          {saved && (
            <span className="badge text-bg-success" role="status">
              Saved
            </span>
          )}
        </div>

        {terminal ? (
          <>
            <p className="small text-secondary mt-2">
              This ticket is closed — ownership, priority and status can no longer change.
            </p>
            <dl className="small mb-0">
              <dt className="text-secondary">Owner</dt>
              <dd>{ownerLine}</dd>
              <dt className="text-secondary">IT Priority</dt>
              <dd>
                <PriorityBadge priority={ticket.itPriority} />
              </dd>
              <dt className="text-secondary">Status</dt>
              <dd className="mb-0">
                <StatusBadge status={ticket.currentStatus} />
              </dd>
            </dl>
          </>
        ) : (
          <fieldset disabled={busy !== null}>
            {/* Owner (FR-13) */}
            <div className="mt-3">
              <div className="small text-secondary">Owner</div>
              <div className="d-flex flex-wrap align-items-center gap-2">
                {ownerLine}
                {ticket.owner?.id !== meId && (
                  <button type="button" className="btn btn-sm btn-success" onClick={() => save('owner', 'owner', { ownerId: meId })}>
                    Claim
                  </button>
                )}
              </div>
              <label htmlFor="ops-owner" className="form-label small mt-2 mb-1">
                Assign to
              </label>
              <div className="d-flex gap-2">
                <select id="ops-owner" className="form-select form-select-sm" value={ownerChoice} onChange={(e) => setOwnerChoice(e.target.value)}>
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  aria-label="Save owner"
                  onClick={() => save('owner', 'owner', { ownerId: ownerChoice ? Number(ownerChoice) : null })}
                >
                  Save
                </button>
              </div>
              {errors.owner && <div className="text-danger small mt-1">{errors.owner}</div>}
            </div>

            {/* IT Priority (FR-14) */}
            <div className="mt-3">
              <label htmlFor="ops-priority" className="form-label small mb-1">
                IT Priority
              </label>
              <div className="d-flex gap-2">
                <select id="ops-priority" className="form-select form-select-sm" value={priorityChoice} onChange={(e) => setPriorityChoice(e.target.value)}>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  aria-label="Save priority"
                  onClick={() => save('priority', 'it-priority', { itPriority: priorityChoice })}
                >
                  Save
                </button>
              </div>
              {errors.priority && <div className="text-danger small mt-1">{errors.priority}</div>}
            </div>

            {/* Status (FR-15) — options only from allowedTransitions */}
            <div className="mt-3">
              <div className="small text-secondary mb-1">
                Status: <StatusBadge status={ticket.currentStatus} />
              </div>
              <label htmlFor="ops-status" className="form-label small mb-1">
                Change status
              </label>
              <div className="d-flex gap-2">
                <select id="ops-status" className="form-select form-select-sm" value={statusChoice} onChange={(e) => setStatusChoice(e.target.value)}>
                  <option value="">Choose…</option>
                  {ticket.allowedTransitions.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  aria-label="Save status"
                  disabled={!statusChoice}
                  onClick={requestStatusChange}
                >
                  Save
                </button>
              </div>
              {errors.status && <div className="text-danger small mt-1">{errors.status}</div>}
            </div>
          </fieldset>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          status={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const status = confirming
            setConfirming(null)
            save('status', 'status', { status })
          }}
        />
      )}
    </section>
  )
}

function ConfirmDialog({ status, onCancel, onConfirm }: { status: string; onCancel: () => void; onConfirm: () => void }) {
  const label = STATUS_LABELS[status] ?? status
  return (
    <div className="tt-dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div
        className="card shadow tt-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
      >
        <div className="card-body">
          <h2 id="confirm-title" className="h5">
            Change status to {label}?
          </h2>
          <p id="confirm-text" className="text-secondary">
            {CONFIRM[status]}
          </p>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel} autoFocus>
              Cancel
            </button>
            <button type="button" className="btn btn-success" onClick={onConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
