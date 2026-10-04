import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch } from '../api'
import type { Role } from '../auth/AuthContext'
import { RoleBadge } from './Badges'

export type Entry = {
  id: number
  body: string
  createdAt: string
  author: { id: number; name: string; role: Role }
}

const MAX = 2000

type ConversationProps = {
  /** GET lists entries, POST adds one (`{ body }`). */
  endpoint: string
  heading: string
  /** Visible label of the textarea. */
  inputLabel: string
  submitLabel: string
  emptyText: string
  /** When set, the form is replaced by this explanation. */
  closedText?: string | null
  variant?: 'public' | 'internal'
  /** Called after a successful post (e.g. to refresh Last Updated). */
  onPosted?: () => void
}

// A list of comments or notes plus its own form (ui-spec §7, §9). Public and
// internal threads are two separate instances — they never share a textarea
// or a toggle, so a note can't be posted publicly by accident.
// Bodies render as plain text: React escapes them, and .tt-pre-wrap keeps
// line breaks (BR-30). Never dangerouslySetInnerHTML.
export default function Conversation({
  endpoint,
  heading,
  inputLabel,
  submitLabel,
  emptyText,
  closedText,
  variant = 'public',
  onPosted,
}: ConversationProps) {
  const headingId = useId()
  const inputId = useId()
  const [entries, setEntries] = useState<Entry[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failure'>('loading')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!Array.isArray(body)) throw new Error('Unexpected response')
      setEntries(body)
      setState('ready')
    } catch {
      setState('failure')
    }
  }, [endpoint])

  useEffect(() => {
    load()
  }, [load])

  const trimmed = draft.trim()
  const canPost = trimmed.length > 0 && trimmed.length <= MAX && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canPost) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not post this.')
        return
      }
      setEntries((list) => [...list, data])
      setDraft('')
      onPosted?.()
    } catch {
      setError('Unable to reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const internal = variant === 'internal'

  return (
    <section className={`card shadow-sm ${internal ? 'tt-internal-note' : ''}`} aria-labelledby={headingId}>
      <div className="card-body">
        <h2 id={headingId} className="h6">
          {internal && <span aria-hidden="true">🔒 </span>}
          {heading}
        </h2>

        {state === 'loading' && <p className="text-secondary small mb-2">Loading…</p>}
        {state === 'failure' && (
          <p className="text-danger small mb-2">
            Couldn't load this list.{' '}
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={load}>
              Retry
            </button>
          </p>
        )}
        {state === 'ready' && entries.length === 0 && <p className="text-secondary small mb-2">{emptyText}</p>}
        {entries.length > 0 && (
          <ul className="list-unstyled mb-3">
            {entries.map((entry) => (
              <li key={entry.id} className="border-bottom py-2">
                <div className="d-flex flex-wrap align-items-center gap-2 small">
                  <strong>{entry.author.name}</strong>
                  <RoleBadge role={entry.author.role} />
                  <time className="text-secondary" dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </div>
                <p className="tt-pre-wrap mb-0 mt-1">{entry.body}</p>
              </li>
            ))}
          </ul>
        )}

        {closedText ? (
          <p className="text-secondary small mb-0">{closedText}</p>
        ) : (
          <form onSubmit={submit} noValidate>
            <label htmlFor={inputId} className="form-label small">
              {inputLabel}
            </label>
            <textarea
              id={inputId}
              className={`form-control ${error ? 'is-invalid' : ''}`}
              rows={3}
              value={draft}
              maxLength={MAX}
              aria-invalid={error ? 'true' : undefined}
              onChange={(e) => setDraft(e.target.value)}
            />
            {error && <div className="invalid-feedback">{error}</div>}
            <div className="d-flex justify-content-between align-items-center mt-2">
              <small className="text-secondary">
                {draft.length} / {MAX}
              </small>
              <button type="submit" className={`btn btn-sm ${internal ? 'btn-outline-warning' : 'btn-success'}`} disabled={!canPost}>
                {busy ? 'Posting…' : submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
