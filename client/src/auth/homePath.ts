import type { Role } from './AuthContext'

/** Where each role lands after sign-in (FR-06). */
export function homePathFor(role: Role) {
  return role === 'REQUESTER' ? '/my-tickets' : '/staff/queue'
}
