import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRequester } from '../requester/RequesterContext'

type TicketRow = {
  id: number
  ticketNumber: string
  summary: string
  requestedPriority: string
  currentStatus: string
  createdAt: string
  category: { name: string } | null
}

type ListState = 'loading' | 'ready' | 'failure'
const PAGE_SIZE = 10

// Lab 2 §8.4, Issue #17: My Tickets — search/filter/sort/pagination, scoped
// to the current Requester only (BR-06). Empty state (never created a
// ticket) is deliberately distinct from no-results (a filter/search matched
// nothing) — AC-09 vs AC-10.
export default function MyTickets() {
  const { requester } = useRequester()

  const [listState, setListState] = useState<ListState>('loading')
  const [items, setItems] = useState<TicketRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'createdAt:desc' | 'createdAt:asc' | 'summary:asc' | 'summary:desc'>(
    'createdAt:desc',
  )

  const filtersActive = search.trim().length > 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    if (!requester) return
    let cancelled = false

    async function load() {
      setListState('loading')
      try {
        const params = new URLSearchParams({
          requesterId: String(requester!.id),
          page: String(page),
          pageSize: String(PAGE_SIZE),
          sort,
        })
        if (search.trim()) params.set('search', search.trim())

        const res = await fetch(`/api/tickets?${params.toString()}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        if (cancelled) return
        setItems(body.items)
        setTotal(body.total)
        setListState('ready')
      } catch {
        if (!cancelled) setListState('failure')
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requester?.id, page, search, sort])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  return (
    <main className="container py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0">My Tickets</h1>
      </div>

      <form onSubmit={handleSearchSubmit} className="row g-2 mb-4">
        <div className="col-auto flex-grow-1">
          <input
            type="search"
            className="form-control"
            placeholder="Search by summary or ticket number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search tickets"
          />
        </div>
        <div className="col-auto">
          <select
            className="form-select"
            value={sort}
            onChange={(e) => {
              setPage(1)
              setSort(e.target.value as typeof sort)
            }}
            aria-label="Sort tickets"
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="summary:asc">Summary A-Z</option>
            <option value="summary:desc">Summary Z-A</option>
          </select>
        </div>
        <div className="col-auto">
          <button type="submit" className="btn btn-success">
            Search
          </button>
        </div>
      </form>

      {listState === 'loading' && (
        <p role="status">⏳ Loading tickets…</p>
      )}

      {listState === 'failure' && (
        <div className="alert alert-danger" role="alert">
          Unable to load your tickets. Please try again.
        </div>
      )}

      {listState === 'ready' && total === 0 && !filtersActive && (
        <div className="alert alert-info" role="status">
          You haven't created any tickets yet.
        </div>
      )}

      {listState === 'ready' && total === 0 && filtersActive && (
        <div className="alert alert-warning" role="status">
          <p className="mb-2">No tickets match your search.</p>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {listState === 'ready' && total > 0 && (
        <>
          {/* Desktop/tablet: table. Zen Green §7 commits mobile to cards
              instead of a horizontally-scrolling table (no clipped columns). */}
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`}>{t.ticketNumber}</Link>
                    </td>
                    <td>{t.summary}</td>
                    <td>{t.category?.name ?? '—'}</td>
                    <td>
                      <span className="badge bg-secondary">{t.requestedPriority}</span>
                    </td>
                    <td>
                      <span className="badge bg-success">{t.currentStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per ticket, no horizontal scrolling needed. */}
          <div className="d-md-none">
            {items.map((t) => (
              <div key={t.id} className="card mb-2">
                <div className="card-body">
                  <Link to={`/tickets/${t.id}`} className="fw-semibold d-block mb-1">
                    {t.ticketNumber}
                  </Link>
                  <p className="mb-2">{t.summary}</p>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-secondary small">{t.category?.name ?? '—'}</span>
                    <span className="d-flex gap-1">
                      <span className="badge bg-secondary">{t.requestedPriority}</span>
                      <span className="badge bg-success">{t.currentStatus}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex justify-content-between align-items-center">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  )
}
