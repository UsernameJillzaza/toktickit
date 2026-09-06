import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Requester = { id: number; name: string; email: string }

const STORAGE_KEY = 'toktickit.selectedRequester'

function isRequester(value: unknown): value is Requester {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return typeof r.id === 'number' && typeof r.name === 'string' && typeof r.email === 'string'
}

// BR-04: the selected Development Requester is a client-side testing
// mechanism (BR-03), persisted in localStorage so it survives a page reload.
function readStoredRequester(): Requester | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Storage was reachable but held something that isn't a Requester
    // (stale format, manual tampering, `{}`) — fail safe rather than
    // rendering with e.g. `requester.name` as undefined.
    return isRequester(parsed) ? parsed : null
  } catch {
    // Corrupt or inaccessible storage (private browsing, quota, etc.) —
    // fail safe back to "no requester selected" rather than throwing.
    return null
  }
}

type RequesterContextValue = {
  requester: Requester | null
  selectRequester: (requester: Requester) => void
  changeRequester: () => void
}

const RequesterContext = createContext<RequesterContextValue | null>(null)

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(readStoredRequester)

  const selectRequester = useCallback((next: Requester) => {
    setRequester(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage write failed — the in-memory selection still works for this
      // session, it just won't survive a reload.
    }
  }, [])

  const changeRequester = useCallback(() => {
    setRequester(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore — see selectRequester.
    }
  }, [])

  const value = useMemo(
    () => ({ requester, selectRequester, changeRequester }),
    [requester, selectRequester, changeRequester],
  )

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>
}

export function useRequester() {
  const ctx = useContext(RequesterContext)
  if (!ctx) throw new Error('useRequester must be used within a RequesterProvider')
  return ctx
}
