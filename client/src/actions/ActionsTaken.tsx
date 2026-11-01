import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch } from '../api'
import type { Role } from '../auth/AuthContext'
import { ActionStatusBadge, FollowUpBadge, RoleBadge } from '../components/Badges'

// Actions Taken (Lab 4 ui-spec §5, §6). One card component for both roles; the
// staff panel adds the form, the Complete/Cancel panels and the create button,
// the Requester panel is a read-only list. Text renders as plain text (React
// escapes it, .tt-pre-wrap keeps line breaks) — never dangerouslySetInnerHTML.

export type ActionTaken = {
  id: number
  ticketId: number
  actionAt: string
  description: string
  result: string | null
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED'
  followUpRequired: boolean
  followUpNote: string | null
  attachmentNotes: string | null
  version: number
  performedBy: { id: number; name: string; role: Role }
  createdBy: { id: number; name: string }
}

type Assignee = { id: number; name: string; role: Role }

const DESCRIPTION_MAX = 2000
const NOTE_MAX = 1000
const ATTACHMENT_NOTES_MAX = 500
const NETWORK_ERROR = 'Unable to reach the server. Please try again.'

// BR-04: limits count characters, not UTF-16 units.
const chars = (s: string) => Array.from(s).length

const pad = (n: number) => String(n).padStart(2, '0')
function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function newRequestKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ---------------------------------------------------------------- the card

function ActionCard({ action, children }: { action: ActionTaken; children?: React.ReactNode }) {
  return (
    <li className={`tt-action-card tt-action-card-${action.status} border rounded p-3 mb-2 bg-white`}>
      <div className="d-flex flex-wrap align-items-center gap-2 small">
        <time className="text-secondary" dateTime={action.actionAt}>
          {new Date(action.actionAt).toLocaleString()}
        </time>
        <strong>{action.performedBy.name}</strong>
        <RoleBadge role={action.performedBy.role} />
        <ActionStatusBadge status={action.status} />
        {action.followUpRequired && <FollowUpBadge />}
      </div>
      <p className="tt-pre-wrap mb-1 mt-2">{action.description}</p>
      {action.result && (
        <p className="tt-pre-wrap small mb-1">
          <span className="text-secondary">{action.status === 'CANCELLED' ? 'Reason: ' : 'Result: '}</span>
          {action.result}
        </p>
      )}
      {action.followUpRequired && action.followUpNote && (
        <p className="tt-pre-wrap small mb-1">
          <span className="text-secondary">Follow-up: </span>
          {action.followUpNote}
        </p>
      )}
      {action.attachmentNotes && (
        <p className="tt-pre-wrap small mb-1">
          <span className="text-secondary">Attachment notes: </span>
          {action.attachmentNotes}
        </p>
      )}
      {children}
    </li>
  )
}

function List({ actions }: { actions: ActionTaken[] }) {
  return <ul className="list-unstyled mb-0">{actions.map((a) => <ActionCard key={a.id} action={a} />)}</ul>
}

// ------------------------------------------------------------ Requester view

export function RequesterActions({ ticketId }: { ticketId: number }) {
  const headingId = useId()
  const [actions, setActions] = useState<ActionTaken[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failure'>('loading')

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}/actions`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!Array.isArray(body.actions)) throw new Error('Unexpected response')
      setActions(body.actions)
      setState('ready')
    } catch {
      setState('failure')
    }
  }, [ticketId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section className="mt-4" aria-labelledby={headingId} aria-busy={state === 'loading'}>
      <h2 id={headingId} className="h5">
        Work done on your ticket
      </h2>
      {state === 'loading' && <p className="text-secondary small">Loading…</p>}
      {state === 'failure' && (
        <p className="text-danger small">
          Couldn't load this list.{' '}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {state === 'ready' && actions.length === 0 && <p className="text-secondary small">No actions have been recorded yet.</p>}
      {actions.length > 0 && <List actions={actions} />}
    </section>
  )
}

// --------------------------------------------------------------------- form

type Values = {
  actionAt: string
  description: string
  performedById: string
  followUpRequired: boolean
  followUpNote: string
  attachmentNotes: string
}
type FieldName = keyof Values
type FieldErrors = Partial<Record<FieldName, string>>

const FIELD_ORDER: FieldName[] = ['actionAt', 'description', 'performedById', 'followUpRequired', 'followUpNote', 'attachmentNotes']

function validate(v: Values): FieldErrors {
  const errors: FieldErrors = {}
  const description = v.description.trim()
  if (!description) errors.description = 'Description is required.'
  else if (chars(description) > DESCRIPTION_MAX) errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`
  if (!v.actionAt || Number.isNaN(new Date(v.actionAt).getTime())) errors.actionAt = 'Enter the date and time of the action.'
  if (v.followUpRequired) {
    const note = v.followUpNote.trim()
    if (!note) errors.followUpNote = 'A follow-up note is required when follow-up is needed.'
    else if (chars(note) > NOTE_MAX) errors.followUpNote = `Follow-up note must be ${NOTE_MAX} characters or fewer.`
  }
  if (chars(v.attachmentNotes.trim()) > ATTACHMENT_NOTES_MAX) {
    errors.attachmentNotes = `Attachment notes must be ${ATTACHMENT_NOTES_MAX} characters or fewer.`
  }
  return errors
}

type Outcome = { ok: true } | { ok: false; fieldErrors?: FieldErrors; banner?: string; stale?: boolean }

type FormProps = {
  idPrefix: string
  initial: Values
  assignees: Assignee[]
  submitLabel: string
  busyLabel?: string
  onSubmit: (values: Values) => Promise<Outcome>
  onCancel: () => void
  /** Shown above the buttons; with `stale` a Reload button is offered. */
  onReload?: () => void
}

function ActionForm({ idPrefix, initial, assignees, submitLabel, onSubmit, onCancel, onReload }: FormProps) {
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false) // a second click in the same tick must not send a second request
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  const set = <K extends FieldName>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }))
  const idOf = (f: FieldName) => `${idPrefix}-${f}`
  const errId = (f: FieldName) => `${idPrefix}-${f}-error`

  function focusFirst(found: FieldErrors) {
    const first = FIELD_ORDER.find((f) => found[f])
    if (first) document.getElementById(idOf(first))?.focus()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    const found = validate(values)
    setErrors(found)
    setBanner(null)
    if (Object.keys(found).length > 0) {
      focusFirst(found)
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      const outcome = await onSubmit(values)
      if (!outcome.ok) {
        setErrors(outcome.fieldErrors ?? {})
        setBanner(outcome.banner ?? null)
        setStale(Boolean(outcome.stale))
        if (outcome.fieldErrors) focusFirst(outcome.fieldErrors)
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function cancel() {
    if (dirty && !window.confirm('Discard what you typed?')) return
    onCancel()
  }

  const invalid = (f: FieldName) => (errors[f] ? 'true' : undefined)
  const described = (f: FieldName) => (errors[f] ? errId(f) : undefined)
  const message = (f: FieldName) =>
    errors[f] ? (
      <div id={errId(f)} className="invalid-feedback d-block">
        {errors[f]}
      </div>
    ) : null

  return (
    <form onSubmit={submit} noValidate className="border rounded p-3 mb-2 bg-white" aria-label={submitLabel}>
      <div className="row g-2">
        <div className="col-lg-6">
          <label htmlFor={idOf('actionAt')} className="form-label small mb-1">
            Action date and time
          </label>
          <input
            id={idOf('actionAt')}
            type="datetime-local"
            className={`form-control form-control-sm ${errors.actionAt ? 'is-invalid' : ''}`}
            value={values.actionAt}
            aria-invalid={invalid('actionAt')}
            aria-describedby={described('actionAt')}
            onChange={(e) => set('actionAt', e.target.value)}
          />
          {message('actionAt')}
        </div>
        <div className="col-lg-6">
          <label htmlFor={idOf('performedById')} className="form-label small mb-1">
            Performed by
          </label>
          <select
            id={idOf('performedById')}
            className={`form-select form-select-sm ${errors.performedById ? 'is-invalid' : ''}`}
            value={values.performedById}
            aria-invalid={invalid('performedById')}
            aria-describedby={described('performedById')}
            onChange={(e) => set('performedById', e.target.value)}
          >
            {!assignees.some((a) => String(a.id) === values.performedById) && <option value={values.performedById}>Current performer</option>}
            {assignees.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
          {message('performedById')}
        </div>
        <div className="col-12">
          <label htmlFor={idOf('description')} className="form-label small mb-1">
            Description
          </label>
          <textarea
            id={idOf('description')}
            rows={3}
            className={`form-control ${errors.description ? 'is-invalid' : ''}`}
            value={values.description}
            aria-invalid={invalid('description')}
            aria-describedby={described('description')}
            onChange={(e) => set('description', e.target.value)}
          />
          <div className="d-flex justify-content-between">
            <div>{message('description')}</div>
            <small className="text-secondary">
              {chars(values.description)} / {DESCRIPTION_MAX}
            </small>
          </div>
        </div>
        <div className="col-12">
          <div className="form-check">
            <input
              id={idOf('followUpRequired')}
              type="checkbox"
              className="form-check-input"
              checked={values.followUpRequired}
              onChange={(e) => set('followUpRequired', e.target.checked)}
            />
            <label htmlFor={idOf('followUpRequired')} className="form-check-label small">
              Follow-up required
            </label>
          </div>
        </div>
        {values.followUpRequired && (
          <div className="col-12">
            <label htmlFor={idOf('followUpNote')} className="form-label small mb-1">
              Follow-up note
            </label>
            <textarea
              id={idOf('followUpNote')}
              rows={2}
              className={`form-control ${errors.followUpNote ? 'is-invalid' : ''}`}
              value={values.followUpNote}
              aria-invalid={invalid('followUpNote')}
              aria-describedby={described('followUpNote')}
              onChange={(e) => set('followUpNote', e.target.value)}
            />
            {message('followUpNote')}
          </div>
        )}
        <div className="col-12">
          <label htmlFor={idOf('attachmentNotes')} className="form-label small mb-1">
            Attachment notes
          </label>
          <input
            id={idOf('attachmentNotes')}
            type="text"
            className={`form-control form-control-sm ${errors.attachmentNotes ? 'is-invalid' : ''}`}
            value={values.attachmentNotes}
            aria-invalid={invalid('attachmentNotes')}
            aria-describedby={described('attachmentNotes')}
            onChange={(e) => set('attachmentNotes', e.target.value)}
          />
          {message('attachmentNotes')}
        </div>
      </div>

      {banner && (
        <div className="alert alert-danger py-2 mt-3 mb-0 d-flex justify-content-between align-items-center" role="alert">
          <span>{banner}</span>
          {stale && onReload && (
            <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={onReload}>
              Reload
            </button>
          )}
        </div>
      )}

      <div className="d-flex gap-2 mt-3">
        <button type="submit" className="btn btn-success" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ------------------------------------------- Complete / Cancel (inline panel)

function FinishPanel({
  kind,
  onSubmit,
  onClose,
  onReload,
}: {
  kind: 'complete' | 'cancel'
  onSubmit: (result: string) => Promise<Outcome>
  onClose: () => void
  onReload: () => void
}) {
  const id = useId()
  const errorId = `${id}-error`
  const label = kind === 'complete' ? 'Result' : 'Reason'
  const button = kind === 'complete' ? 'Mark completed' : 'Cancel action'
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    area.current?.focus()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    const trimmed = text.trim()
    setBanner(null)
    if (!trimmed) {
      setError(`${label} is required.`)
      area.current?.focus()
      return
    }
    if (chars(trimmed) > DESCRIPTION_MAX) {
      setError(`${label} must be ${DESCRIPTION_MAX} characters or fewer.`)
      area.current?.focus()
      return
    }
    setError(null)
    busyRef.current = true
    setBusy(true)
    try {
      const outcome = await onSubmit(trimmed)
      if (!outcome.ok) {
        setError(outcome.fieldErrors?.description ?? null)
        setBanner(outcome.banner ?? null)
        setStale(Boolean(outcome.stale))
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="border-top mt-2 pt-2" aria-label={button}>
      <label htmlFor={id} className="form-label small mb-1">
        {label}
      </label>
      <textarea
        id={id}
        ref={area}
        rows={2}
        className={`form-control ${error ? 'is-invalid' : ''}`}
        value={text}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <div id={errorId} className="invalid-feedback d-block">
          {error}
        </div>
      )}
      {banner && (
        <div className="alert alert-danger py-2 mt-2 mb-0 d-flex justify-content-between align-items-center" role="alert">
          <span>{banner}</span>
          {stale && (
            <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={onReload}>
              Reload
            </button>
          )}
        </div>
      )}
      <div className="d-flex gap-2 mt-2">
        <button type="submit" className={`btn btn-sm ${kind === 'complete' ? 'btn-success' : 'btn-outline-danger'}`} disabled={busy}>
          {busy ? 'Saving…' : button}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  )
}

// --------------------------------------------------------------- staff panel

type Mode = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; id: number } | { kind: 'finish'; id: number; how: 'complete' | 'cancel' }

// Server answers that mean "what you are looking at is out of date".
const CONFLICT_CODES = new Set(['STALE_UPDATE', 'ACTION_FINAL'])

export function StaffActions({
  ticketId,
  meId,
  assignees,
  onChanged,
  refreshToken,
}: {
  ticketId: number
  meId: number
  assignees: Assignee[]
  /** A change succeeded: refresh the Ticket summary (status, Last Updated, hint). */
  onChanged: () => void
  /**
   * Changes whenever the Ticket changed elsewhere on the screen (a status
   * change, a reload): the list and `workable` are fetched again, so "New
   * action" is disabled the moment the Ticket is Resolved (BR-11).
   */
  refreshToken?: string
}) {
  const headingId = useId()
  const base = `/api/staff/tickets/${ticketId}/actions`
  const [actions, setActions] = useState<ActionTaken[]>([])
  const [workable, setWorkable] = useState(true)
  const [state, setState] = useState<'loading' | 'ready' | 'failure'>('loading')
  const [mode, setMode] = useState<Mode>({ kind: 'none' })
  const [formKey, setFormKey] = useState('')
  const [formOpenedAt, setFormOpenedAt] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(base)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!Array.isArray(body.actions)) throw new Error('Unexpected response')
      setActions(body.actions)
      setWorkable(body.workable !== false)
      setState('ready')
    } catch {
      setState((s) => (s === 'ready' ? s : 'failure'))
    }
  }, [base])

  useEffect(() => {
    load()
  }, [load, refreshToken])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  const open = actions.filter((a) => a.status === 'OPEN').length
  const completed = actions.filter((a) => a.status === 'COMPLETED').length

  async function afterSuccess() {
    setMode({ kind: 'none' })
    setSaved(true)
    await load()
    onChanged()
  }

  async function reload() {
    setMode({ kind: 'none' })
    await load()
    onChanged()
  }

  // Maps one failed response (or a network failure) to what the form shows.
  async function failure(res: Response | null): Promise<Outcome> {
    if (!res) return { ok: false, banner: NETWORK_ERROR }
    const data = await res.json().catch(() => ({}))
    const message: string = data.error ?? 'Could not save this action.'
    if (res.status === 409 && data.code === 'TICKET_NOT_WORKABLE') {
      setWorkable(false)
      return { ok: false, banner: message }
    }
    if (res.status === 409 && CONFLICT_CODES.has(data.code)) {
      return {
        ok: false,
        banner: data.code === 'STALE_UPDATE' ? 'This action was changed by someone else. Reload to see the latest.' : message,
        stale: true,
      }
    }
    if (res.status === 400 && data.field) {
      const field = data.field as FieldName | 'result' | 'version'
      return { ok: false, fieldErrors: { [field === 'result' ? 'description' : field]: message } as FieldErrors }
    }
    return { ok: false, banner: message }
  }

  async function send(url: string, method: string, body: unknown): Promise<Response | null> {
    try {
      return await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      return null
    }
  }

  const toBody = (v: Values) => ({
    description: v.description.trim(),
    actionAt: new Date(v.actionAt).toISOString(),
    performedById: Number(v.performedById),
    followUpRequired: v.followUpRequired,
    followUpNote: v.followUpRequired ? v.followUpNote.trim() : null,
    attachmentNotes: v.attachmentNotes.trim() || null,
  })

  async function create(v: Values): Promise<Outcome> {
    const body: Record<string, unknown> = { requestKey: formKey, ...toBody(v) }
    if (!v.followUpRequired) delete body.followUpNote
    if (!v.attachmentNotes.trim()) delete body.attachmentNotes
    const res = await send(base, 'POST', body)
    if (res && res.ok) {
      await afterSuccess()
      return { ok: true }
    }
    return failure(res)
  }

  async function edit(action: ActionTaken, v: Values): Promise<Outcome> {
    const res = await send(`${base}/${action.id}`, 'PATCH', { version: action.version, ...toBody(v) })
    if (res && res.ok) {
      await afterSuccess()
      return { ok: true }
    }
    return failure(res)
  }

  async function finish(action: ActionTaken, how: 'complete' | 'cancel', result: string): Promise<Outcome> {
    const res = await send(`${base}/${action.id}/${how}`, 'POST', { version: action.version, result })
    if (res && res.ok) {
      await afterSuccess()
      return { ok: true }
    }
    return failure(res)
  }

  function openCreate() {
    setFormKey(newRequestKey())
    setFormOpenedAt(toLocalInput(new Date()))
    setMode({ kind: 'create' })
  }

  const valuesOf = (a: ActionTaken): Values => ({
    actionAt: toLocalInput(new Date(a.actionAt)),
    description: a.description,
    performedById: String(a.performedBy.id),
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote ?? '',
    attachmentNotes: a.attachmentNotes ?? '',
  })

  const counts = [completed > 0 && `${completed} completed`, open > 0 && `${open} open`].filter(Boolean).join(', ')

  return (
    <section className="card shadow-sm mt-3" aria-labelledby={headingId} aria-busy={state === 'loading'}>
      <div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h2 id={headingId} className="h6 mb-0">
            Actions taken{counts && <small className="text-secondary fw-normal"> — {counts}</small>}
          </h2>
          <div className="d-flex align-items-center gap-2">
            {saved && (
              <span className="badge text-bg-success" role="status">
                Saved
              </span>
            )}
            <button type="button" className="btn btn-sm btn-success" disabled={!workable || mode.kind === 'create'} onClick={openCreate}>
              New action
            </button>
          </div>
        </div>
        <p className="small text-secondary mb-2 mt-1">Visible to the requester. Put confidential details in Internal Notes.</p>
        {!workable && <p className="small text-secondary">Reopen the ticket to add actions.</p>}

        {mode.kind === 'create' && (
          <ActionForm
            idPrefix="new-action"
            initial={{ actionAt: formOpenedAt, description: '', performedById: String(meId), followUpRequired: false, followUpNote: '', attachmentNotes: '' }}
            assignees={assignees}
            submitLabel="Save action"
            onSubmit={create}
            onCancel={() => setMode({ kind: 'none' })}
            onReload={reload}
          />
        )}

        {state === 'loading' && <p className="text-secondary small mb-0">Loading…</p>}
        {state === 'failure' && (
          <div className="alert alert-danger py-2 mb-0 d-flex justify-content-between align-items-center" role="alert">
            <span>Couldn't load the actions.</span>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
              Retry
            </button>
          </div>
        )}
        {state === 'ready' && actions.length === 0 && mode.kind !== 'create' && <p className="text-secondary small mb-0">No actions taken yet.</p>}

        {actions.length > 0 && (
          <ul className="list-unstyled mb-0">
            {actions.map((a) => {
              if (mode.kind === 'edit' && mode.id === a.id) {
                return (
                  <li key={a.id}>
                    <ActionForm
                      idPrefix={`edit-action-${a.id}`}
                      initial={valuesOf(a)}
                      assignees={assignees}
                      submitLabel="Save changes"
                      onSubmit={(v) => edit(a, v)}
                      onCancel={() => setMode({ kind: 'none' })}
                      onReload={reload}
                    />
                  </li>
                )
              }
              const finishing = mode.kind === 'finish' && mode.id === a.id ? mode.how : null
              return (
                <ActionCard key={a.id} action={a}>
                  {a.status === 'OPEN' && !finishing && (
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`Edit action ${a.id}`} onClick={() => setMode({ kind: 'edit', id: a.id })}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-success" aria-label={`Complete action ${a.id}`} onClick={() => setMode({ kind: 'finish', id: a.id, how: 'complete' })}>
                        Complete
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Cancel action ${a.id}`} onClick={() => setMode({ kind: 'finish', id: a.id, how: 'cancel' })}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {finishing && (
                    <FinishPanel kind={finishing} onSubmit={(result) => finish(a, finishing, result)} onClose={() => setMode({ kind: 'none' })} onReload={reload} />
                  )}
                </ActionCard>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
