import { Forbidden } from '../components/StatusPages'
import { DashboardFrame, MetricCard, MetricGrid, Panel, Skeleton, TicketList } from './parts'
import type { TicketRow } from './parts'
import { isObject, useDashboard } from './useDashboard'

type RequesterData = {
  generatedAt: string
  metrics: { open: number; waitingForYou: number; resolvedLast30Days: number }
  needsAttention: TicketRow[]
  recentlyUpdated: TicketRow[]
}

const isRequesterData = (b: unknown): b is RequesterData =>
  isObject(b) && isObject(b.metrics) && Array.isArray(b.needsAttention) && Array.isArray(b.recentlyUpdated)

// ui-spec §4.2. Each "View" link opens My Tickets with the filter that
// reproduces the card's number (BR-30); no IT Priority appears (BR-28).
export default function RequesterDashboard() {
  const { data, state, retry } = useDashboard('/api/dashboard/requester', isRequesterData)
  if (state === 'forbidden') return <Forbidden />

  return (
    <DashboardFrame state={state} generatedAt={data?.generatedAt} onRetry={retry} skeleton={<Skeleton cards={3} lists={2} />}>
      {data && (
        <>
          <MetricGrid>
            <MetricCard label="Open tickets" value={data.metrics.open} to="/my-tickets?status=open" viewLabel="View open tickets" />
            <MetricCard
              label="Waiting for you"
              value={data.metrics.waitingForYou}
              to="/my-tickets?status=WAITING_FOR_REQUESTER"
              viewLabel="View tickets waiting for you"
              accent={data.metrics.waitingForYou > 0}
            />
            <MetricCard
              label="Resolved (last 30 days)"
              value={data.metrics.resolvedLast30Days}
              to="/my-tickets?status=resolved&updatedWithinDays=30"
              viewLabel="View tickets resolved in the last 30 days"
            />
          </MetricGrid>
          <div className="row g-3">
            <div className="col-lg-6">
              <Panel title="Needs your attention" empty="No tickets need your attention." isEmpty={data.needsAttention.length === 0}>
                <TicketList rows={data.needsAttention} hrefFor={(id) => `/tickets/${id}`} />
              </Panel>
            </div>
            <div className="col-lg-6">
              <Panel title="Recently updated" empty="You haven't created any tickets yet." isEmpty={data.recentlyUpdated.length === 0}>
                <TicketList rows={data.recentlyUpdated} hrefFor={(id) => `/tickets/${id}`} />
              </Panel>
            </div>
          </div>
        </>
      )}
    </DashboardFrame>
  )
}
