import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequester } from './RequesterContext'
import type { Requester } from './RequesterContext'

type FetchState = 'loading' | 'empty' | 'failure' | 'ready'

// Lab 2 §8.1: Development Requester Selection screen — a testing mechanism,
// not a login screen (BR-03). Required elements: title, explanatory text,
// dropdown of active requesters, Continue button, loading/empty/failure
// states, keyboard-accessible controls.
export default function RequesterSelect() {
  const [state, setState] = useState<FetchState>('loading')
  const [requesters, setRequesters] = useState<Requester[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const { selectRequester } = useRequester()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState('loading')
      try {
        const res = await fetch('/api/requesters')
        if (!res.ok) throw new Error(`requesters HTTP ${res.status}`)
        const data: Requester[] = await res.json()
        if (cancelled) return
        if (data.length === 0) {
          setState('empty')
        } else {
          setRequesters(data)
          setSelectedId(String(data[0].id))
          setState('ready')
        }
      } catch {
        if (!cancelled) setState('failure')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function handleContinue() {
    const requester = requesters.find((r) => String(r.id) === selectedId)
    if (!requester) return
    selectRequester(requester)
    navigate('/')
  }

  return (
    <main className="container py-5" style={{ maxWidth: 480 }}>
      <h1 className="h3 fw-bold mb-3">TokTickIT</h1>
      <p className="text-secondary">
        Select a Development Requester to test requester-specific ticket behavior. This is not a
        login screen. Authentication and role-based access will be introduced in Lab 3.
      </p>

      {state === 'loading' && (
        <p className="mt-4" role="status">
          ⏳ Loading requesters…
        </p>
      )}

      {state === 'empty' && (
        <div className="alert alert-warning mt-4" role="alert">
          No active Development Requesters are available. Ask an administrator to seed at least
          one active requester.
        </div>
      )}

      {state === 'failure' && (
        <div className="alert alert-danger mt-4" role="alert">
          Unable to load Development Requesters. Please check your connection and try again.
        </div>
      )}

      {state === 'ready' && (
        <div className="mt-4">
          <label htmlFor="requester-select" className="form-label">
            Development Requester
          </label>
          <select
            id="requester-select"
            className="form-select mb-3"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {requesters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <button type="button" className="btn btn-success" onClick={handleContinue}>
            Continue
          </button>
        </div>
      )}
    </main>
  )
}
