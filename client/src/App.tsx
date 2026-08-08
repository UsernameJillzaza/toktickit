import { useState } from 'react'

type Health = { status: string; service: string }

function App() {
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function checkSystem() {
    setLoading(true)
    setError(null)
    setOnline(null)
    try {
      const res = await fetch('/api/health')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Health = await res.json()
      setOnline(data.status === 'ok')
    } catch {
      setOnline(false)
      setError('Unable to connect to TokTickIT API')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container py-5">
      <h1 className="display-5 fw-bold text-success mb-4">TokTickIT IT Service Desk</h1>

      <button
        type="button"
        className="btn btn-success"
        onClick={checkSystem}
        disabled={loading}
      >
        {loading ? 'Checking…' : 'Check System'}
      </button>

      {loading && (
        <p className="mt-3 text-secondary" role="status">
          ⏳ loading…
        </p>
      )}

      {!loading && online !== null && (
        <div className="mt-3">
          <p className="mb-1">
            System Status:{' '}
            <span className={online ? 'text-success fw-semibold' : 'text-danger fw-semibold'}>
              {online ? 'Online' : 'Offline'}
            </span>
          </p>
          {error && <p className="text-danger mb-0">{error}</p>}
        </div>
      )}
    </main>
  )
}

export default App
