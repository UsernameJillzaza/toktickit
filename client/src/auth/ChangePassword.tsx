import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { NETWORK_ERROR_MESSAGE, useAuth } from './AuthContext'
import { homePathFor } from './homePath'
import { PASSWORD_POLICY_SUMMARY, passwordPolicyError } from './passwordPolicy'

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword'
type FieldErrors = Partial<Record<Field, string>>

// ui-spec.md §5 — two modes on one screen:
//  - forced: the account still has an initial password (BR-02); no way out
//    except finishing or logging out (the shell hides the menu).
//  - voluntary: opened from the menu; has Cancel.
export default function ChangePassword() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const forced = Boolean(user?.mustChangePassword)
  const [values, setValues] = useState<Record<Field, string>>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function update(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !user) return
    const next: FieldErrors = {}
    if (!values.currentPassword) next.currentPassword = 'Current password is required.'
    const policy = passwordPolicyError(values.newPassword, user.email)
    if (policy) next.newPassword = policy
    if (!values.confirmPassword) next.confirmPassword = 'Please confirm your new password.'
    else if (values.confirmPassword !== values.newPassword) next.confirmPassword = 'Passwords do not match.'
    setErrors(next)
    setAlert(null)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    let res: Response
    try {
      res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      })
    } catch {
      setBusy(false)
      setAlert(NETWORK_ERROR_MESSAGE)
      return
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBusy(false)
      // The server names the field it rejected (wrong current password,
      // PASSWORD_REUSE, WEAK_PASSWORD) — show it right under that input.
      if (body.field === 'currentPassword' || body.field === 'newPassword') {
        setErrors({ [body.field]: body.error })
      } else {
        setAlert(body.error ?? NETWORK_ERROR_MESSAGE)
      }
      return
    }
    const updated = body.user ?? { ...user, mustChangePassword: false }
    setUser(updated)
    navigate(homePathFor(updated.role), { replace: true, state: { flash: 'Password updated' } })
  }

  function input(field: Field, label: string, autoComplete: string) {
    const id = `cp-${field}`
    const error = errors[field]
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          {label} <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id={id}
          type="password"
          autoComplete={autoComplete}
          required
          className={`form-control ${error ? 'is-invalid' : ''}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          value={values[field]}
          onChange={(e) => update(field, e.target.value)}
        />
        {error && (
          <div id={`${id}-error`} className="invalid-feedback">
            {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="container py-5">
      <div className="card shadow-sm mx-auto" style={{ maxWidth: 480 }}>
        <div className="card-body p-4">
          <h1 className="h4 mb-2">{forced ? 'Choose a new password' : 'Change password'}</h1>
          {forced && (
            <p className="text-secondary">
              Your account uses an initial password. Choose a new one to continue.
            </p>
          )}

          <div className="alert alert-light border small" aria-label="Password rules">
            {PASSWORD_POLICY_SUMMARY}
          </div>

          {alert && (
            <div className="alert alert-danger" role="alert">
              {alert}
            </div>
          )}

          <form noValidate onSubmit={handleSubmit}>
            <fieldset disabled={busy}>
              {input('currentPassword', 'Current password', 'current-password')}
              {input('newPassword', 'New password', 'new-password')}
              {input('confirmPassword', 'Confirm new password', 'new-password')}
              <div className="d-flex gap-2 mt-4">
                <button type="submit" className="btn btn-success">
                  {busy ? 'Saving…' : 'Save new password'}
                </button>
                {!forced && (
                  <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                    Cancel
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </main>
  )
}
