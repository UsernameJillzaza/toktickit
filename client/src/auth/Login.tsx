import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

type FieldErrors = { email?: string; password?: string }
type Alert = { tone: 'danger' | 'warning'; message: string }

// ui-spec.md §4 — Login Screen. Deliberately no "sign up" or "forgot
// password" links: both are excluded from Lab 3 scope.
export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [alert, setAlert] = useState<Alert | null>(null)
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  // After a failed attempt, put the cursor back in Password. This must run
  // after the re-render: until then the <fieldset> is still disabled, and a
  // control inside a disabled fieldset can't take focus.
  useEffect(() => {
    if (alert && !busy) passwordRef.current?.focus()
  }, [alert, busy])

  // Already signed in (e.g. pressed Back after logging in) — don't show the form.
  if (user && !busy) return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const next: FieldErrors = {}
    if (!email.trim()) next.email = 'Email is required.'
    if (!password) next.password = 'Password is required.'
    setErrors(next)
    setAlert(null)
    if (next.email || next.password) return

    setBusy(true)
    const result = await login(email.trim(), password)
    if (result.ok) {
      navigate(result.user.mustChangePassword ? '/change-password' : '/', { replace: true })
      return
    }
    setBusy(false)
    // D-14: the server already makes unknown-email and wrong-password look
    // identical; the client just shows whatever it says. The password is
    // cleared so a mistyped secret doesn't stay on screen.
    setPassword('')
    setAlert({
      tone: result.code === 'ACCOUNT_INACTIVE' ? 'warning' : 'danger',
      message: result.message,
    })
  }

  return (
    <main className="container py-5">
      <div className="card shadow-sm mx-auto" style={{ maxWidth: 420 }}>
        <div className="card-body p-4">
          <h1 className="h4 mb-4">Sign in to TokTickIT</h1>

          {alert && (
            <div className={`alert alert-${alert.tone}`} role="alert">
              {alert.message}
            </div>
          )}

          <form noValidate onSubmit={handleSubmit}>
            <fieldset disabled={busy}>
              <div className="mb-3">
                <label htmlFor="login-email" className="form-label">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                  aria-invalid={errors.email ? 'true' : undefined}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errors.email && (
                  <div id="login-email-error" className="invalid-feedback">
                    {errors.email}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label htmlFor="login-password" className="form-label">
                  Password
                </label>
                <input
                  id="login-password"
                  ref={passwordRef}
                  type="password"
                  autoComplete="current-password"
                  className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                  aria-invalid={errors.password ? 'true' : undefined}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {errors.password && (
                  <div id="login-password-error" className="invalid-feedback">
                    {errors.password}
                  </div>
                )}
              </div>

              <button type="submit" className="btn btn-success w-100">
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </fieldset>
          </form>
        </div>
      </div>
    </main>
  )
}
