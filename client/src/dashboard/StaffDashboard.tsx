import { Link } from 'react-router-dom'
import { ActionStatusBadge, PriorityBadge } from '../components/Badges'
import RelativeTime from '../components/RelativeTime'
import { PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from '../components/labels'
import { Forbidden } from '../components/StatusPages'
import type { Role } from '../auth/AuthContext'
import { DashboardFrame, MetricCard, MetricGrid, Panel, Skeleton, TicketList } from './parts'
import type { TicketRow } from './parts'
import { isObject, useDashboard } from './useDashboard'

type StaffData = {
  generatedAt: string
  metrics: { unassigned: number; myActive: number; requesterReportsResolved: number }
  byStatus: Record<string, number>
  byItPriority: Record<string, number>
  urgent: TicketRow[]
  recentlyUpdated: TicketRow[]
  myRecentActions: { id: number; ticketId: number; ticketNumber: string; description: string; status: string; actionAt: string }[]
  users?: { total: number; active: number; inactive: number; byRole: Record<Role, number> }
}

const isStaffData = (b: unknown): b is StaffData =>
  isObject(b) &&
  isObject(b.metrics) &&
  isObject(b.byStatus) &&
  isObject(b.byItPriority) &&
  Array.isArray(b.urgent) &&
  Array.isArray(b.recentlyUpdated) &&
  Array.isArray(b.myRecentActions) &&
  (b.users === undefined || isObject(b.users))

// ui-spec §4.3. The Administrator gets the same screen plus the Users cards,
// and only when the response contains `users` (BR-31): the screen never
// decides that from the role alone.
export default function StaffDashboard() {
  const { data, state, retry } = useDashboard('/api/dashboard/staff', isStaffData)
  if (state === 'forbidden') return <Forbidden />

  return (
    <DashboardFrame state={state} generatedAt={data?.generatedAt} onRetry={retry} skeleton={<Skeleton cards={3} lists={4} />}>
      {data && (
        <>
          <MetricGrid>
            <MetricCard label="Unassigned" value={data.metrics.unassigned} to="/staff/queue?owner=unassigned" viewLabel="View unassigned tickets" />
            <MetricCard label="Assigned to me" value={data.metrics.myActive} to="/staff/queue?owner=me" viewLabel="View tickets assigned to me" />
            <MetricCard
              label="Requester reports resolved"
              value={data.metrics.requesterReportsResolved}
              to="/staff/queue?requesterResolved=true"
              viewLabel="View tickets the requester reports as resolved"
              prefix="✓"
            />
            {data.users && <MetricCard label="Users" value={data.users.total} to="/admin/users" viewLabel="View users" />}
          </MetricGrid>

          <div className="row g-3 mb-3">
            <div className="col-lg-6">
              <Panel title="By status" empty="" isEmpty={false}>
                <ul className="list-unstyled mb-0">
                  {Object.entries(data.byStatus).map(([status, n]) => (
                    <li key={status} className="d-flex justify-content-between py-1 border-top">
                      <Link to={`/staff/queue?status=${status}`} aria-label={`View ${STATUS_LABELS[status] ?? status} tickets`}>
                        {STATUS_LABELS[status] ?? status}
                      </Link>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
            <div className="col-lg-6">
              <Panel title="By IT priority (active)" empty="" isEmpty={false}>
                <ul className="list-unstyled mb-0">
                  {Object.entries(data.byItPriority).map(([priority, n]) => (
                    <li key={priority} className="d-flex justify-content-between align-items-center py-1 border-top">
                      <Link to={`/staff/queue?priority=${priority}`} aria-label={`View active ${PRIORITY_LABELS[priority] ?? priority} priority tickets`}>
                        <PriorityBadge priority={priority} />
                      </Link>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-lg-6">
              <Panel
                title="Urgent"
                empty="No urgent tickets."
                isEmpty={data.urgent.length === 0}
                viewAll={{ to: '/staff/queue?priority=CRITICAL', label: 'View all critical tickets' }}
              >
                <TicketList rows={data.urgent} hrefFor={(id) => `/staff/tickets/${id}`} showOwner />
              </Panel>
            </div>
            <div className="col-lg-6">
              <Panel title="Recently updated" empty="No tickets yet." isEmpty={data.recentlyUpdated.length === 0}>
                <TicketList rows={data.recentlyUpdated} hrefFor={(id) => `/staff/tickets/${id}`} />
              </Panel>
            </div>
          </div>

          <Panel title="My recent actions" empty="You haven't recorded any actions yet." isEmpty={data.myRecentActions.length === 0}>
            <ul className="list-unstyled mb-0">
              {data.myRecentActions.map((a) => (
                <li key={a.id} className="py-2 border-top">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <Link to={`/staff/tickets/${a.ticketId}`} className="fw-semibold">
                      {a.ticketNumber}
                    </Link>
                    <span className="d-inline-flex align-items-center gap-2">
                      <ActionStatusBadge status={a.status} />
                      <small className="text-secondary">
                        <RelativeTime iso={a.actionAt} />
                      </small>
                    </span>
                  </div>
                  <div className="text-truncate" title={a.description}>
                    {a.description}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {data.users && (
            <section className="tt-metric-card mt-3" aria-label="Users by role">
              <h2 className="h6">Users by role</h2>
              <p className="small text-secondary mb-2">
                {data.users.active} active, {data.users.inactive} inactive
              </p>
              <ul className="list-unstyled mb-0 d-flex flex-wrap gap-4">
                {(Object.keys(data.users.byRole) as Role[]).map((role) => (
                  <li key={role}>
                    {ROLE_LABELS[role]}: <strong>{data.users!.byRole[role]}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </DashboardFrame>
  )
}
