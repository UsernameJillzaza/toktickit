import type { Role } from './AuthContext'

/** Where each role lands after sign-in (FR-06). Staff/Admin get their queue in L3-5. */
export function homePathFor(role: Role) {
  return role === 'REQUESTER' ? '/my-tickets' : '/system-status'
}
