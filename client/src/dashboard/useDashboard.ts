import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'

export type DashState = 'loading' | 'ready' | 'failure' | 'forbidden'

/**
 * Loads a dashboard endpoint; `retry` refetches it (AC-33). `isValid` guards
 * the shape: an answer the screen cannot draw is a failure with Retry, never a
 * blank page or a crash.
 */
export function useDashboard<T>(url: string, isValid: (body: unknown) => body is T) {
  const [data, setData] = useState<T | null>(null)
  const [state, setState] = useState<DashState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    apiFetch(url)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 403) return setState('forbidden')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body: unknown = await res.json()
        if (cancelled) return
        if (!isValid(body)) throw new Error('Unexpected response')
        setData(body)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('failure')
      })
    return () => {
      cancelled = true
    }
    // `isValid` is a module-level function in each screen, so it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, state, retry }
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
