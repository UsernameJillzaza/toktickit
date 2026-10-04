import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../auth/AuthContext'
import { passwordPolicyError, PASSWORD_POLICY_SUMMARY } from '../auth/passwordPolicy'
import { RoleBadge } from '../components/Badges'
import { ROLE_LABELS } from '../components/labels'
import { Forbidden } from '../components/StatusPages'

type User = {
  id: number
  name: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
}

type Panel = { mode: 'create' } | { mode: 'edit'; user: User } | null
type FieldErrors = Partial<Record<'name' | 'email' | 'role' | 'initialPassword', string>>

const ROLES = Object.keys(ROLE_LABELS) as Role[]
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Client mirror of the server checks (src/admin/routes.ts); the server
// still decides — these only save a round trip.
function checkUserFields(name: string, email: string): FieldErrors {
  const errors: FieldErrors = {}
  const n = name.trim()
  if (n.length < 2 || n.length > 100) errors.name = 'Name must be 2–100 characters.'
  const e = email.trim()
  if (!EMAIL_SHAPE.test(e) || e.length > 254) errors.email = 'Enter a valid email address (at most 254 characters).'
  return errors
}

// FR-19 … FR-22 / ui-spec §10. The form is a panel above the table, not a
// modal, so keyboard and screen-reader users stay in the page flow.
export default function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failure' | 'forbidden'>('loading')
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (role) params.set('role', role)
    const query = params.toString()
    setState((s) => (s === 'ready' ? s : 'loading'))
    try {
      const res = await apiFetch(`/api/admin/users${query ? `?${query}` : ''}`)
      if (res.status === 403) return setState('forbidden')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setUsers(await res.json())
      setState('ready')
    } catch {
      setState('failure')
    }
  }, [search, role])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function done(message: string) {
    setPanel(null)
    setToast(message)
    load()
  }

  if (state === 'forbidden') return <Forbidden />

  return (
    <main className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2">
        <h1 className="h3 mb-0">User Management</h1>
        {!panel && (
          <button type="button" className="btn btn-success" onClick={() => setPanel({ mode: 'create' })}>
            Create user
          </button>
        )}
      </div>

      {toast && (
        <div className="alert alert-success py-2" role="status">
          {toast}
        </div>
      )}

      {panel?.mode === 'create' && <UserForm key="create" onCancel={() => setPanel(null)} onDone={done} />}
      {panel?.mode === 'edit' && (
        <>
          <UserForm key={`edit-${panel.user.id}`} user={panel.user} isSelf={panel.user.id === me!.id} onCancel={() => setPanel(null)} onDone={done} />
          <InitialPasswordCard user={panel.user} onDone={done} />
        </>
      )}

      <div className="card shadow-sm mb-3">
        <div className="card-body d-flex flex-column flex-md-row gap-2 align-items-md-end">
          <form
            className="d-flex gap-2 flex-grow-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(searchDraft.trim())
            }}
          >
            <input
              type="search"
              className="form-control"
              aria-label="Search name or email"
              placeholder="Search name or email"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-success">
              Search
            </button>
          </form>
          <div>
            <label htmlFor="user-role-filter" className="form-label small mb-1">
              Role
            </label>
            <select id="user-role-filter" className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {state === 'loading' && (
        <div className="text-center text-secondary py-4" role="status">
          Loading users…
        </div>
      )}
      {state === 'failure' && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>We couldn't load the user list.</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {state === 'ready' && users.length === 0 && <div className="alert alert-info">No users match.</div>}

      {state === 'ready' && users.length > 0 && (
        // One table for every width: below 768px CSS turns each row into a
        // card (.tt-stack-table), so there is a single Edit button per user.
        <div className="card shadow-sm">
          <table className="table align-middle mb-0 tt-stack-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Edit</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Name" className="fw-semibold">
                    {u.name}
                  </td>
                  <td data-label="Email" className="text-break">
                    {u.email}
                  </td>
                  <td data-label="Role">
                    <RoleBadge role={u.role} />
                  </td>
                  <td data-label="Status">
                    <span className="d-inline-flex flex-wrap gap-1">
                      <span className={`badge ${u.isActive ? 'text-bg-success' : 'text-bg-secondary'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                      {u.mustChangePassword && <span className="badge tt-badge tt-badge-must-change">Must change password</span>}
                    </span>
                  </td>
                  <td data-label="Edit">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary tt-stack-full"
                      aria-label={`Edit ${u.name}`}
                      onClick={() => setPanel({ mode: 'edit', user: u })}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

type UserFormProps = {
  user?: User
  isSelf?: boolean
  onCancel: () => void
  onDone: (message: string) => void
}

function UserForm({ user, isSelf = false, onCancel, onDone }: UserFormProps) {
  const editing = Boolean(user)
  const title = editing ? `Edit ${user!.name}` : 'Create user'
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'REQUESTER')
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next = checkUserFields(name, email)
    if (!editing) {
      const problem = passwordPolicyError(password, email.trim())
      if (problem) next.initialPassword = problem
    }
    setErrors(next)
    setAlert(null)
    if (Object.keys(next).length > 0) return

    let body: Record<string, unknown>
    if (editing) {
      // Send only what changed (BR-34), so an unchanged role/isActive on
      // your own account never trips SELF_MODIFICATION.
      body = {}
      if (name.trim() !== user!.name) body.name = name.trim()
      if (email.trim().toLowerCase() !== user!.email) body.email = email.trim()
      if (role !== user!.role) body.role = role
      if (isActive !== user!.isActive) body.isActive = isActive
      if (Object.keys(body).length === 0) return setAlert('Nothing to change.')
    } else {
      body = { name: name.trim(), email: email.trim(), role, isActive, initialPassword: password }
    }

    setBusy(true)
    try {
      const res = await apiFetch(editing ? `/api/admin/users/${user!.id}` : '/api/admin/users', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.field && ['name', 'email', 'role', 'initialPassword'].includes(data.field)) setErrors({ [data.field]: data.error })
        else setAlert(data.error ?? 'Could not save.')
        return
      }
      onDone(editing ? 'Changes saved.' : 'User created. They must choose a new password at first sign-in.')
    } catch {
      setAlert('Unable to reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card shadow-sm mb-3" aria-label={title} onSubmit={submit} noValidate>
      <fieldset className="card-body" disabled={busy}>
        <h2 className="h5">{title}</h2>
        {alert && (
          <div className="alert alert-danger py-2" role="alert">
            {alert}
          </div>
        )}
        <div className="row g-3">
          <Field label="Name" error={errors.name} className="col-md-6">
            {(id, describedBy) => (
              <input id={id} className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? 'true' : undefined} aria-describedby={describedBy} />
            )}
          </Field>
          <Field label="Email" error={errors.email} className="col-md-6">
            {(id, describedBy) => (
              <input id={id} type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={errors.email ? 'true' : undefined} aria-describedby={describedBy} />
            )}
          </Field>
          <Field label="Role" error={errors.role} className="col-md-6">
            {(id, describedBy) => (
              <select id={id} className="form-select" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)} aria-describedby={describedBy}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="col-md-6 d-flex align-items-end">
            <div className="form-check form-switch mb-2">
              <input id={`active-${user?.id ?? 'new'}`} type="checkbox" role="switch" className="form-check-input" checked={isActive} disabled={isSelf} onChange={(e) => setIsActive(e.target.checked)} />
              <label htmlFor={`active-${user?.id ?? 'new'}`} className="form-check-label">
                Active
              </label>
            </div>
          </div>
          {isSelf && (
            <p className="col-12 small text-secondary mb-0">You can't deactivate or change the role of your own account.</p>
          )}
          {!editing && (
            <Field label="Initial password" error={errors.initialPassword} className="col-md-6" hint={PASSWORD_POLICY_SUMMARY}>
              {(id, describedBy) => (
                <input id={id} type="password" autoComplete="new-password" className={`form-control ${errors.initialPassword ? 'is-invalid' : ''}`} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={errors.initialPassword ? 'true' : undefined} aria-describedby={describedBy} />
              )}
            </Field>
          )}
        </div>
        <div className="d-flex gap-2 mt-3">
          <button type="submit" className="btn btn-success">
            {editing ? 'Save changes' : 'Create user'}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  )
}

function InitialPasswordCard({ user, onDone }: { user: User; onDone: (message: string) => void }) {
  const headingId = useId()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = passwordPolicyError(password, user.email)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/initial-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialPassword: password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data.error ?? 'Could not set the password.')
      onDone(`New initial password set for ${user.name}.`)
    } catch {
      setError('Unable to reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card shadow-sm mb-3 border-warning" aria-labelledby={headingId}>
      <form className="card-body" onSubmit={submit} noValidate>
        <h2 id={headingId} className="h6">
          Set a new initial password
        </h2>
        <p className="small text-secondary">The user will be signed out and must choose a new password at next sign-in.</p>
        <Field label="New initial password" error={error ?? undefined} hint={PASSWORD_POLICY_SUMMARY}>
          {(id, describedBy) => (
            <input id={id} type="password" autoComplete="new-password" className={`form-control ${error ? 'is-invalid' : ''}`} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} />
          )}
        </Field>
        <button type="submit" className="btn btn-warning mt-2" disabled={busy}>
          Set initial password
        </button>
      </form>
    </section>
  )
}

function Field({
  label,
  error,
  hint,
  className = '',
  children,
}: {
  label: string
  error?: string
  hint?: string
  className?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
}) {
  const id = useId()
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label">
        {label} <span className="text-danger" aria-hidden="true">*</span>
      </label>
      {children(id, describedBy)}
      {error && (
        <div id={`${id}-error`} className="invalid-feedback d-block">
          {error}
        </div>
      )}
      {hint && (
        <div id={`${id}-hint`} className="form-text">
          {hint}
        </div>
      )}
    </div>
  )
}
