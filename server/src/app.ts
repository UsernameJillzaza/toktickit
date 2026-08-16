import 'dotenv/config'
import express from 'express'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

// The Express app is defined here and exported WITHOUT calling listen(),
// so tests (Supertest) can import it directly. server.ts owns listen().
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const app = express()

app.use(express.json())

// Liveness landing route.
app.get('/', (_req, res) => {
  res.json({ service: 'TokTickIT API', message: 'Foundation running.' })
})

// GET /api/health — health-check contract (Lab 1 §7.2, §10.1).
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' })
})

// GET /api/categories — category list (Lab 1 §7.4, §10.2).
app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })
    res.status(200).json(categories)
  } catch (err) {
    console.error(err)
    res.status(503).json({ error: 'Database unavailable' })
  }
})

export default app
