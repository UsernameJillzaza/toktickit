import type { TicketStatus } from '../generated/prisma/client'

// Spec Section 5.2 — the one place the transition matrix lives. The API
// enforces it and sends `allowedTransitions` to the UI, so the client never
// keeps its own copy (api-spec: "UI shows options from this value").
// Listed in matrix column order so the UI shows a stable order.
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
}

/** BR-23: a ticket in one of these statuses must have an owner. */
export const OWNER_REQUIRED_STATUSES: ReadonlySet<TicketStatus> = new Set([
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
])

export const ALL_STATUSES = Object.keys(TRANSITIONS) as TicketStatus[]

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (ALL_STATUSES as string[]).includes(value)
}

/** BR-20: CLOSED and CANCELLED can't change owner, priority or status any more. */
export function isTerminal(status: TicketStatus): boolean {
  return status === 'CLOSED' || status === 'CANCELLED'
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function allowedTransitions(from: TicketStatus): TicketStatus[] {
  return [...TRANSITIONS[from]]
}
