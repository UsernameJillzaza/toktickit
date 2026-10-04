import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { SESSION_ENDED_EVENT } from '../api'

export type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMIN'

export type AuthUser = {
  id: number
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code?: string; message: string; field?: string }

export const NETWORK_ERROR_MESSAGE = 'Unable to reach the server. Please try again.'

// BR-42: the Lab 2 Development Requester selector kept its choice here.
// Identity now comes only from the session cookie, so the stale value is
// removed on startup — nothing reads it any more, but leaving it behind
// would look like the old impersonation mechanism still exists.
const LEGACY_SELECTOR_KEY = 'toktickit.selectedRequester'

function clearLegacySelector() {
  try {
    window.localStorage.removeItem(LEGACY_SELECTOR_KEY)
  } catch {
    // Storage unavailable (private mode etc.) — nothing to clean up.
  }
}

type AuthContextValue = {
  user: AuthUser | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  setUser: (user: AuthUser | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthProviderProps = {
  children: ReactNode
  /**
   * Skip the `/api/auth/me` round trip and start with this user (or signed
   * out, for `null`). Tests use it so a screen can be rendered as a given
   * role without stubbing the session lookup.
   */
  initialUser?: AuthUser | null
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const hasInitial = initialUser !== undefined
  const [user, setUserState] = useState<AuthUser | null>(initialUser ?? null)
  const [status, setStatus] = useState<AuthStatus>(
    hasInitial ? (initialUser ? 'authenticated' : 'anonymous') : 'loading',
  )

  useEffect(() => {
    clearLegacySelector()
    if (hasInitial) return
    let cancelled = false
    // The cookie is HttpOnly, so the only way to know who is signed in is
    // to ask the server. 401 simply means "nobody" — not an error to show.
    fetch('/api/auth/me')
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setUserState(null)
          setStatus('anonymous')
          return
        }
        const body = await res.json()
        setUserState(body.user)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        setUserState(null)
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [hasInitial])

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next)
    setStatus(next ? 'authenticated' : 'anonymous')
  }, [])

  // apiFetch saw a 401: forget the user, and RequireAuth sends them to Login.
  useEffect(() => {
    const onSessionEnded = () => setUser(null)
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded)
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded)
  }, [setUser])

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      let res: Response
      try {
        res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
      } catch {
        return { ok: false, message: NETWORK_ERROR_MESSAGE }
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          ok: false,
          code: body.code,
          field: body.field,
          message: body.error ?? NETWORK_ERROR_MESSAGE,
        }
      }
      setUser(body.user)
      return { ok: true, user: body.user }
    },
    [setUser],
  )

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Even if the server is unreachable, forget the user locally; the
      // session row expires on its own (BR-05).
    }
    setUser(null)
  }, [setUser])

  const value = useMemo(
    () => ({ user, status, login, logout, setUser }),
    [user, status, login, logout, setUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
