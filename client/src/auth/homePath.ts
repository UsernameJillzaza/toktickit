import type { Role } from './AuthContext'

/** Where each role lands after sign-in: every role has a Dashboard (Lab 4 FR-14, D-13). */
export function homePathFor(_role: Role) {
  return '/dashboard'
}
