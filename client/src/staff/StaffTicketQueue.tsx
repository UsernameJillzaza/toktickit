import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import { PRIORITY_LABELS, STATUS_LABELS } from '../components/labels'
import RelativeTime from '../components/RelativeTime'
import { Forbidden } from '../components/StatusPages'

type QueueItem = {
  id: number
  ticketNumber: string
  summary: string
  currentStatus: string
  itPriority: string
  updatedAt: string
  requesterResolvedAt: string | null
  category: { id: number; name: string }
  requester: { id: number; name: string; email: string }
  owner: { id: number; name: string } | null
}

type Category = { id: number; name: string }
type LoadState = 'loading' | 'ready' | 'failure' | 'forbidden'

const PAGE_SIZE = 10

// Quick filters (ui-spec §8) map onto the API's `owner` parameter.
const VIEWS = [
  { value: 'all', label: 'All open', owner: 'any' },
  { value: 'mine', label: 'My tickets', owner: 'me' },
  { value: 'unassigned', label: 'Unassigned', owner: 'unassigned' },
] as const

const SORTS = [
  { value: 'createdAt:desc', label: 'Newest' },
  { value: 'createdAt:asc', label: 'Oldest' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'itPriority:desc', label: 'IT Priority high→low' },
  { value: 'ticketNumber:asc', label: 'Ticket number' },
]

const DEFAULTS = { view: 'all', status: 'active', priority: '', categoryId: '', sort: 'createdAt:desc', search: '' }
type Filters = typeof DEFAULTS

function readFilters(params: URLSearchParams): Filters & { page: number } {
  const page = Number(params.get('page'))
  return {
    view: params.get('view') ?? DEFAULTS.view,
    status: params.get('status') ?? DEFAULTS.status,
    priority: params.get('priority') ?? DEFAULTS.priority,
    categoryId: params.get('categoryId') ?? DEFAULTS.categoryId,
    sort: params.get('sort') ?? DEFAULTS.sort,
    search: params.get('search') ?? DEFAULTS.search,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

function isFiltered(f: Filters) {
  return (Object.keys(DEFAULTS) as (keyof Filters)[]).some((k) => k !== 'sort' && f[k] !== DEFAULTS[k])
}

// FR-11 / ui-spec §8. Every filter lives in the URL query string, so a
// filtered view survives a reload and can be shared as a link.
export default function StaffTicketQueue() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const [items, setItems] = useState<QueueItem[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<LoadState>('loading')
  const [categories, setCategories] = useState<Category[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const query = params.toString()

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Category[]) => {
        if (!cancelled) setCategories(list)
      })
      .catch(() => {
        // The Category filter just stays empty; the queue still works.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const f = readFilters(new URLSearchParams(query))
    const api = new URLSearchParams({
      status: f.status,
      owner: VIEWS.find((v) => v.value === f.view)?.owner ?? 'any',
      sort: f.sort,
      page: String(f.page),
      pageSize: String(PAGE_SIZE),
    })
    if (f.priority) api.set('priority', f.priority)
    if (f.categoryId) api.set('categoryId', f.categoryId)
    if (f.search) api.set('search', f.search)

    setState('loading')
    apiFetch(`/api/staff/tickets?${api.toString()}`)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 403) return setState('forbidden')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        if (cancelled) return
        setItems(body.items)
        setTotal(body.total)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('failure')
      })
    return () => {
      cancelled = true
    }
  }, [query, reloadKey])

  // Any filter change goes back to page 1 (UI-16); defaults are left out of
  // the URL to keep it short.
  const update = useCallback(
    (changes: Partial<Filters> & { page?: number }) => {
      const next = { ...readFilters(params), page: 1, ...changes }
      const out = new URLSearchParams()
      for (const key of Object.keys(DEFAULTS) as (keyof Filters)[]) {
        if (next[key] !== DEFAULTS[key]) out.set(key, next[key])
      }
      if (next.page > 1) out.set('page', String(next.page))
      setParams(out)
    },
    [params, setParams],
  )

  function clearFilters() {
    setSearchDraft('')
    setParams(new URLSearchParams())
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault()
    update({ search: searchDraft.trim() })
  }

  if (state === 'forbidden') return <Forbidden />

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <main className="container py-4">
      <h1 className="h3 mb-3">Ticket Queue</h1>

      <div className="card shadow-sm mb-3">
        <div className="card-body d-flex flex-column flex-lg-row flex-wrap gap-2 align-items-lg-end">
          <form className="d-flex gap-2 flex-grow-1" role="search" onSubmit={submitSearch}>
            <input
              type="search"
              className="form-control"
              placeholder="Ticket number, summary, requester…"
              aria-label="Search tickets"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-success">
              Search
            </button>
          </form>

          <div className="btn-group" role="group" aria-label="Quick filter">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                className={`btn btn-sm ${filters.view === v.value ? 'btn-success' : 'btn-outline-success'}`}
                aria-pressed={filters.view === v.value}
                onClick={() => update({ view: v.value })}
              >
                {v.label}
              </button>
            ))}
          </div>

          <Select label="Status" value={filters.status} onChange={(status) => update({ status })}>
            <option value="active">Active</option>
            <option value="all">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select label="IT Priority" value={filters.priority} onChange={(priority) => update({ priority })}>
            <option value="">Any</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select label="Category" value={filters.categoryId} onChange={(categoryId) => update({ categoryId })}>
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Sort" value={filters.sort} onChange={(sort) => update({ sort })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>

          <button type="button" className="btn btn-sm btn-link" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </div>

      {state === 'loading' && (
        <div className="text-center py-5 text-secondary" role="status">
          Loading tickets…
        </div>
      )}

      {state === 'failure' && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>We couldn't load the ticket queue. Check your connection and try again.</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && items.length === 0 && !isFiltered(filters) && (
        <div className="alert alert-info">No tickets in the queue yet.</div>
      )}

      {state === 'ready' && items.length === 0 && isFiltered(filters) && (
        <div className="alert alert-info d-flex justify-content-between align-items-center">
          <span>No tickets match these filters.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {state === 'ready' && items.length > 0 && (
        <>
          {/* Desktop ≥992px: 7-column table (ui-spec §8) */}
          <div className="card shadow-sm d-none d-lg-block">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Requester</th>
                  <th scope="col">Category</th>
                  <th scope="col">IT Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td style={{ maxWidth: 360 }}>
                      <Link to={`/staff/tickets/${t.id}`} className="fw-semibold">
                        {t.ticketNumber}
                      </Link>
                      <div className="tt-clamp-2 text-secondary small">{t.summary}</div>
                    </td>
                    <td>{t.requester.name}</td>
                    <td>{t.category.name}</td>
                    <td>
                      <PriorityBadge priority={t.itPriority} />
                    </td>
                    <td>
                      <StatusCell item={t} />
                    </td>
                    <td>
                      <OwnerName owner={t.owner} />
                    </td>
                    <td>
                      <RelativeTime iso={t.updatedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablet / mobile <992px: cards */}
          <ul className="list-unstyled d-lg-none mb-0" aria-label="Tickets">
            {items.map((t) => (
              <li key={t.id} className="card shadow-sm mb-2">
                <div className="card-body py-2">
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <Link to={`/staff/tickets/${t.id}`} className="fw-semibold">
                      {t.ticketNumber}
                    </Link>
                    <StatusCell item={t} />
                  </div>
                  <div className="tt-clamp-2">{t.summary}</div>
                  <div className="small text-secondary">
                    {t.requester.name} · <OwnerName owner={t.owner} />
                  </div>
                  <div className="d-flex justify-content-between align-items-center small mt-1">
                    <PriorityBadge priority={t.itPriority} />
                    <RelativeTime iso={t.updatedAt} />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <nav className="d-flex justify-content-between align-items-center mt-3" aria-label="Queue pages">
            <span className="text-secondary">{total === 1 ? '1 ticket' : `${total} tickets`}</span>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={filters.page <= 1}
                onClick={() => update({ ...filters, page: filters.page - 1 })}
              >
                Previous
              </button>
              <span>
                Page {filters.page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={filters.page >= totalPages}
                onClick={() => update({ ...filters, page: filters.page + 1 })}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </main>
  )
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const id = `queue-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div>
      <label htmlFor={id} className="form-label small mb-1">
        {label}
      </label>
      <select id={id} className="form-select form-select-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  )
}

function StatusCell({ item }: { item: QueueItem }) {
  return (
    <span className="d-inline-flex flex-wrap gap-1 align-items-center">
      <StatusBadge status={item.currentStatus} />
      {item.requesterResolvedAt && <span className="badge tt-badge tt-badge-resolved-indicator">✓ Requester reports resolved</span>}
    </span>
  )
}

function OwnerName({ owner }: { owner: QueueItem['owner'] }) {
  return owner ? <span>{owner.name}</span> : <em className="text-secondary">Unassigned</em>
}
