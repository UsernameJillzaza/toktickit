import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../components/Badges'
import RelativeTime from '../components/RelativeTime'
import type { DashState } from './useDashboard'

// Pieces shared by the Requester and the IT Staff / Administrator dashboards
// (Lab 4 ui-spec §4.1). The screens never count or filter anything themselves:
// every number and list comes from the API (BR-25).

export type TicketRow = {
  id: number
  ticketNumber: string
  summary: string
  status: string
  updatedAt: string
  itPriority?: string
  owner?: { id: number; name: string } | null
}

/** Title, "Updated <time>", and the region that carries `aria-busy` while loading. */
export function DashboardFrame({
  state,
  generatedAt,
  onRetry,
  skeleton,
  children,
}: {
  state: DashState
  generatedAt?: string
  onRetry: () => void
  skeleton: ReactNode
  children: ReactNode
}) {
  return (
    <main className="container py-4" aria-busy={state === 'loading'}>
      <div className="d-flex flex-wrap align-items-baseline gap-2 mb-3">
        <h1 className="h3 mb-0">Dashboard</h1>
        {state === 'ready' && generatedAt && (
          <small className="text-secondary">Updated {new Date(generatedAt).toLocaleTimeString()}</small>
        )}
      </div>
      {state === 'loading' && skeleton}
      {state === 'failure' && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>We couldn't load the dashboard.</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {state === 'ready' && children}
    </main>
  )
}

/** Grey placeholder blocks shaped like the cards and the lists. */
export function Skeleton({ cards, lists }: { cards: number; lists: number }) {
  return (
    <div role="status" aria-label="Loading the dashboard">
      <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-4 g-3 mb-4">
        {Array.from({ length: cards }, (_, i) => (
          <div className="col" key={i}>
            <div className="tt-metric-card tt-skeleton" style={{ height: 110 }} />
          </div>
        ))}
      </div>
      <div className="row g-3">
        {Array.from({ length: lists }, (_, i) => (
          <div className="col-lg-6" key={i}>
            <div className="tt-metric-card tt-skeleton" style={{ height: 220 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-4 g-3 mb-4">{children}</div>
}

/**
 * One number and the single focusable "View" link that opens the list behind
 * it. The whole card is not a link, so keyboard order stays predictable.
 */
export function MetricCard({
  label,
  value,
  to,
  viewLabel,
  accent,
  prefix,
}: {
  label: string
  value: number
  to: string
  viewLabel: string
  accent?: boolean
  prefix?: string
}) {
  return (
    <div className="col">
      <div className={`tt-metric-card h-100${accent ? ' tt-metric-accent' : ''}`} role="group" aria-label={label}>
        <div className="small text-secondary">{label}</div>
        <div className="display-6 fw-semibold my-1">
          {prefix && <span aria-hidden="true">{prefix} </span>}
          {value}
        </div>
        <Link to={to} aria-label={viewLabel} className="small">
          View
        </Link>
      </div>
    </div>
  )
}

/** A titled panel (ui-spec §4.1 "lists") with an empty sentence and an optional "View all". */
export function Panel({
  title,
  empty,
  isEmpty,
  viewAll,
  children,
}: {
  title: string
  empty: string
  isEmpty: boolean
  viewAll?: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <section className="tt-metric-card h-100" aria-label={title}>
      <div className="d-flex justify-content-between align-items-baseline mb-2">
        <h2 className="h6 mb-0">{title}</h2>
        {viewAll && (
          <Link to={viewAll.to} aria-label={viewAll.label} className="small">
            View all
          </Link>
        )}
      </div>
      {isEmpty ? <p className="text-secondary small mb-0">{empty}</p> : children}
    </section>
  )
}

/** Up to five tickets: number (link), cut summary with the full text as a tooltip, status, relative time. */
export function TicketList({ rows, hrefFor, showOwner }: { rows: TicketRow[]; hrefFor: (id: number) => string; showOwner?: boolean }) {
  return (
    <ul className="list-unstyled mb-0">
      {rows.map((t) => (
        <li key={t.id} className="py-2 border-top">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <Link to={hrefFor(t.id)} className="fw-semibold">
              {t.ticketNumber}
            </Link>
            <span className="d-inline-flex align-items-center gap-2">
              <StatusBadge status={t.status} />
              <small className="text-secondary">
                <RelativeTime iso={t.updatedAt} />
              </small>
            </span>
          </div>
          <div className="text-truncate" title={t.summary}>
            {t.summary}
          </div>
          {showOwner && (
            <small className="text-secondary">{t.owner ? `Owner: ${t.owner.name}` : <em>Unassigned</em>}</small>
          )}
        </li>
      ))}
    </ul>
  )
}
