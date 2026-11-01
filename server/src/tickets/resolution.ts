import type { TicketStatus } from '../generated/prisma/client'

// The resolution and cancel gates (Lab 4 spec BR-19, BR-20). Pure: it only
// looks at how many Actions a Ticket has in each state, so the unit tests
// (UNIT-02) need no database, and the route and the screen's hint cannot
// drift apart — both ask this one function.

export type GateReason = 'NO_COMPLETED_ACTION' | 'OPEN_ACTIONS'

export type ActionCounts = { open: number; completed: number; cancelled: number }

/**
 * Why a Ticket may NOT move to `target` because of its Actions; empty when it
 * may. RESOLVED needs ≥ 1 Completed and 0 Open; CANCELLED needs 0 Open; every
 * other status is not gated. Reasons come in a fixed order.
 */
export function gateReasons(target: TicketStatus, counts: ActionCounts): GateReason[] {
  const reasons: GateReason[] = []
  if (target === 'RESOLVED') {
    if (counts.completed === 0) reasons.push('NO_COMPLETED_ACTION')
    if (counts.open > 0) reasons.push('OPEN_ACTIONS')
  } else if (target === 'CANCELLED') {
    if (counts.open > 0) reasons.push('OPEN_ACTIONS')
  }
  return reasons
}

/** What the staff detail returns so the screen can explain the gate before it is hit. */
export function resolutionHint(counts: ActionCounts) {
  const reasons = gateReasons('RESOLVED', counts)
  return {
    canResolve: reasons.length === 0,
    canCancel: gateReasons('CANCELLED', counts).length === 0,
    reasons,
  }
}

const SENTENCES: Record<GateReason, string> = {
  NO_COMPLETED_ACTION: 'it has no completed action yet',
  OPEN_ACTIONS: 'it still has an open action',
}

/** The sentence a `409 RESOLUTION_BLOCKED` carries for a given target. */
export function gateMessage(target: TicketStatus, reasons: GateReason[]): string {
  const verb = target === 'CANCELLED' ? 'cancelled' : 'resolved'
  return `This ticket cannot be ${verb} yet: ${reasons.map((r) => SENTENCES[r]).join(' and ')}.`
}
