import express from 'express'

// The Express app is defined here and exported WITHOUT calling listen(),
// so tests (Supertest) can import it directly. server.ts owns listen().
const app = express()

app.use(express.json())

// Liveness landing route — foundation only.
// GET /api/health arrives in Issue #2, GET /api/categories in Issue #4.
app.get('/', (_req, res) => {
  res.json({ service: 'TokTickIT API', message: 'Foundation running.' })
})

export default app
