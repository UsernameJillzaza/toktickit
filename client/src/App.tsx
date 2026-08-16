import { useState } from 'react'

type Category = { id: number; name: string }

function App() {
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)

  async function checkSystem() {
    setLoading(true)
    setError(null)
    setOnline(null)
    setCategories([])
    try {
      const health = await fetch('/api/health')
      if (!health.ok) throw new Error(`health HTTP ${health.status}`)
      const healthData = await health.json()

      const list = await fetch('/api/categories')
      if (!list.ok) throw new Error(`categories HTTP ${list.status}`)
      const listData: Category[] = await list.json()

      setOnline(healthData.status === 'ok')
      setCategories(listData)
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
          {online && categories.length > 0 && (
            <>
              <h2 className="h5 mt-4">Supported Request Categories</h2>
              <ul className="list-group">
                {categories.map((c) => (
                  <li key={c.id} className="list-group-item">
                    {c.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </main>
  )
}

export default App
