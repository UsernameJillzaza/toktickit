import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS } from './labels'

// ui-spec.md §6. Neither page says anything about the resource that was
// refused — not even whether it exists.
function StatusCard({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="container py-5">
      <div className="card shadow-sm mx-auto text-center" style={{ maxWidth: 520 }}>
        <div className="card-body p-4">
          <h1 className="h4">{title}</h1>
          {children}
          <Link to="/" className="btn btn-success mt-3">
            Go to my home page
          </Link>
        </div>
      </div>
    </main>
  )
}

export function Forbidden() {
  const { user } = useAuth()
  return (
    <StatusCard title="You don't have access to this page">
      {user && (
        <p className="text-secondary mb-0">
          You are signed in as {ROLE_LABELS[user.role]}, which can't open this page.
        </p>
      )}
    </StatusCard>
  )
}

export function NotFound() {
  return <StatusCard title="Page not found" />
}
