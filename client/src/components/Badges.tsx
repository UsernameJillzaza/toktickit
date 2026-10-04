import type { Role } from '../auth/AuthContext'
import { PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from './labels'

// ui-spec.md §2. Every badge carries text (never color alone) and the
// `tt-badge tt-badge-<kind>-<VALUE>` class pair the style test checks.
// Raw enum values never reach the screen.

function Badge({ kind, value, label }: { kind: string; value: string; label: string }) {
  return <span className={`badge tt-badge tt-badge-${kind}-${value}`}>{label}</span>
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge kind="role" value={role} label={ROLE_LABELS[role]} />
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge kind="status" value={status} label={STATUS_LABELS[status] ?? status} />
}

/** `prefix` ("Req." / "IT") is used when both priorities sit side by side. */
export function PriorityBadge({ priority, prefix }: { priority: string; prefix?: string }) {
  const label = PRIORITY_LABELS[priority] ?? priority
  return <Badge kind="priority" value={priority} label={prefix ? `${prefix} ${label}` : label} />
}
