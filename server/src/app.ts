import express from 'express'

// The Express app is defined here and exported WITHOUT calling listen(),
// so tests (Supertest) can import it directly. server.ts owns listen().
const app = express()

app.use(express.json())

// Liveness landing route.
app.get('/', (_req, res) => {
  res.json({ service: 'TokTickIT API', message: 'Foundation running.' })
})

// GET /api/health — health-check contract (Lab 1 §7.2, §10.1).
// GET /api/categories arrives in Issue #4.
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' })
})

export default app
