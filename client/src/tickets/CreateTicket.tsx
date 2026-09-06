import { useEffect, useState } from 'react'
import { useRequester } from '../requester/RequesterContext'

type RefItem = { id: number; name: string }
type RefState = 'loading' | 'ready' | 'failure'
type SubmitState = 'idle' | 'submitting' | 'success' | 'failure'

type FieldErrors = Partial<Record<'summary' | 'description' | 'requestedPriority' | 'category' | 'relatedSystem', string>>

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

// Lab 2 §8.2/§8.3, Issue #16: Create Ticket screen. Six required states
// (§14 Part 6): initial, loading, validation failure, submitting, success,
// API failure. System-generated Ticket Number is read-only and only ever
// shown after a successful save (BR-01).
export default function CreateTicket() {
  const { requester } = useRequester()

  const [refState, setRefState] = useState<RefState>('loading')
  const [categories, setCategories] = useState<RefItem[]>([])
  const [relatedSystems, setRelatedSystems] = useState<RefItem[]>([])

  const [categoryId, setCategoryId] = useState('')
  const [relatedSystemId, setRelatedSystemId] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [requestedPriority, setRequestedPriority] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [apiError, setApiError] = useState<string | null>(null)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadReferenceData() {
      setRefState('loading')
      try {
        const [categoriesRes, relatedSystemsRes] = await Promise.all([
          fetch('/api/categories'),
          fetch('/api/related-systems'),
        ])
        if (!categoriesRes.ok || !relatedSystemsRes.ok) throw new Error('reference data HTTP error')

        const [categoriesData, relatedSystemsData] = await Promise.all([
          categoriesRes.json(),
          relatedSystemsRes.json(),
        ])
        if (cancelled) return
        setCategories(categoriesData)
        setRelatedSystems(relatedSystemsData)
        setRefState('ready')
      } catch {
        if (!cancelled) setRefState('failure')
      }
    }

    loadReferenceData()
    return () => {
      cancelled = true
    }
  }, [])

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    const trimmedSummary = summary.trim()
    const trimmedDescription = description.trim()

    if (trimmedSummary.length < 10 || trimmedSummary.length > 150) {
      errors.summary = 'Summary must be 10-150 characters.'
    }
    if (trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
      errors.description = 'Description must be 10-2000 characters.'
    }
    if (!PRIORITIES.includes(requestedPriority as (typeof PRIORITIES)[number])) {
      errors.requestedPriority = 'Select a priority.'
    }
    if (!categoryId) errors.category = 'Select a category.'
    if (!relatedSystemId) errors.relatedSystem = 'Select a related system.'

    return errors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitState === 'submitting' || !requester) return

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitState('submitting')
    setApiError(null)

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: requester.id,
          categoryId: Number(categoryId),
          relatedSystemId: Number(relatedSystemId),
          summary: summary.trim(),
          description: description.trim(),
          requestedPriority,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const ticket = await res.json()
      setTicketNumber(ticket.ticketNumber)
      setSubmitState('success')
      // Form values are intentionally left as-is (BR-11 only requires
      // preservation on *failure*; the success view replaces the form below).
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unable to create ticket.')
      setSubmitState('failure')
    }
  }

  if (refState === 'loading') {
    return (
      <main className="container py-5">
        <p role="status">⏳ Loading form…</p>
      </main>
    )
  }

  if (refState === 'failure') {
    return (
      <main className="container py-5">
        <div className="alert alert-danger" role="alert">
          Unable to load categories and related systems. Please try again.
        </div>
      </main>
    )
  }

  if (submitState === 'success') {
    return (
      <main className="container py-5" style={{ maxWidth: 560 }}>
        <div className="alert alert-success" role="status">
          <h2 className="h5 mb-2">Ticket created</h2>
          <p className="mb-0">
            Your official Ticket Number is <strong>{ticketNumber}</strong>.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="container py-5" style={{ maxWidth: 560 }}>
      <h1 className="h3 fw-bold mb-4">Create Ticket</h1>

      {apiError && (
        <div className="alert alert-danger" role="alert">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor="ticket-number" className="form-label">
            Ticket Number
          </label>
          <input
            id="ticket-number"
            className="form-control"
            value="Generated after saving"
            disabled
            readOnly
          />
        </div>

        <div className="mb-3">
          <label htmlFor="ticket-category" className="form-label">
            Category <span className="text-danger">*</span>
          </label>
          <select
            id="ticket-category"
            className={`form-select${fieldErrors.category ? ' is-invalid' : ''}`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {fieldErrors.category && <div className="invalid-feedback d-block">{fieldErrors.category}</div>}
        </div>

        <div className="mb-3">
          <label htmlFor="ticket-related-system" className="form-label">
            Related System <span className="text-danger">*</span>
          </label>
          <select
            id="ticket-related-system"
            className={`form-select${fieldErrors.relatedSystem ? ' is-invalid' : ''}`}
            value={relatedSystemId}
            onChange={(e) => setRelatedSystemId(e.target.value)}
          >
            <option value="">Select a related system…</option>
            {relatedSystems.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {fieldErrors.relatedSystem && (
            <div className="invalid-feedback d-block">{fieldErrors.relatedSystem}</div>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="ticket-priority" className="form-label">
            Requested Priority <span className="text-danger">*</span>
          </label>
          <select
            id="ticket-priority"
            className={`form-select${fieldErrors.requestedPriority ? ' is-invalid' : ''}`}
            value={requestedPriority}
            onChange={(e) => setRequestedPriority(e.target.value)}
          >
            <option value="">Select a priority…</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {fieldErrors.requestedPriority && (
            <div className="invalid-feedback d-block">{fieldErrors.requestedPriority}</div>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="ticket-summary" className="form-label">
            Summary <span className="text-danger">*</span>
          </label>
          <input
            id="ticket-summary"
            className={`form-control${fieldErrors.summary ? ' is-invalid' : ''}`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          {fieldErrors.summary && <div className="invalid-feedback d-block">{fieldErrors.summary}</div>}
        </div>

        <div className="mb-4">
          <label htmlFor="ticket-description" className="form-label">
            Description <span className="text-danger">*</span>
          </label>
          <textarea
            id="ticket-description"
            className={`form-control${fieldErrors.description ? ' is-invalid' : ''}`}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {fieldErrors.description && (
            <div className="invalid-feedback d-block">{fieldErrors.description}</div>
          )}
        </div>

        <button type="submit" className="btn btn-success" disabled={submitState === 'submitting'}>
          {submitState === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </main>
  )
}
