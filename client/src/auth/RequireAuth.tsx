import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import type { Role } from './AuthContext'
import { Forbidden } from '../components/StatusPages'

type RequireAuthProps = {
  children: ReactNode
  /** Roles allowed here; omit to allow any signed-in user. */
  roles?: Role[]
  /** True only for the Change Password route itself (BR-02). */
  allowPasswordChange?: boolean
}

// Client-side mirror of the server's authenticate → requireAuth →
// requireRole chain. It only decides what to *show*; the API enforces the
// same rules independently, so bypassing this guard reveals nothing.
export default function RequireAuth({ children, roles, allowPasswordChange }: RequireAuthProps) {
  const { user, status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="container py-5 text-center" role="status">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to="/change-password" replace />
  if (roles && !roles.includes(user.role)) return <Forbidden />
  return children
}
