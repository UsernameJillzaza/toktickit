import 'dotenv/config'
import express from 'express'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'
import { generateTicketNumber } from './ticketNumber'

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

// GET /api/requesters — active Development Requesters only (Lab 2 §5.3, BR-05).
// This selector is a testing mechanism, not authentication (BR-03).
app.get('/api/requesters', async (_req, res) => {
  try {
    const requesters = await prisma.devRequester.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    })
    res.status(200).json(requesters)
  } catch (err) {
    console.error(err)
    res.status(503).json({ error: 'Database unavailable' })
  }
})

// GET /api/related-systems — reference data for Ticket creation (Lab 2 §5.3).
app.get('/api/related-systems', async (_req, res) => {
  try {
    const items = await prisma.relatedSystem.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.status(200).json(items)
  } catch (err) {
    console.error(err)
    res.status(503).json({ error: 'Database unavailable' })
  }
})

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

function validateTicketInput(body: unknown): { field: string; message: string } | null {
  const b = (body ?? {}) as Record<string, unknown>

  if (typeof b.summary !== 'string' || b.summary.trim().length < 10 || b.summary.trim().length > 150) {
    return { field: 'summary', message: 'Summary must be 10-150 characters.' }
  }
  if (
    typeof b.description !== 'string' ||
    b.description.trim().length < 10 ||
    b.description.trim().length > 2000
  ) {
    return { field: 'description', message: 'Description must be 10-2000 characters.' }
  }
  if (typeof b.requestedPriority !== 'string' || !PRIORITIES.includes(b.requestedPriority)) {
    return { field: 'requestedPriority', message: 'requestedPriority must be LOW, MEDIUM, or HIGH.' }
  }
  if (typeof b.requesterId !== 'number') {
    return { field: 'requesterId', message: 'requesterId is required.' }
  }
  if (typeof b.categoryId !== 'number') {
    return { field: 'categoryId', message: 'categoryId is required.' }
  }
  if (typeof b.relatedSystemId !== 'number') {
    return { field: 'relatedSystemId', message: 'relatedSystemId is required.' }
  }
  return null
}

// POST /api/tickets — Create Ticket (Lab 2 §4.4, §6, Issue #16). BR-08/BR-09
// validate input; BR-01 generates the Ticket Number; a missing FK (requester
// not found/inactive, category, related system) is a 404, not a 400 — the
// request shape was fine, the referenced resource just doesn't exist.
app.post('/api/tickets', async (req, res) => {
  const validationError = validateTicketInput(req.body)
  if (validationError) {
    return res.status(400).json({ error: validationError.message, field: validationError.field })
  }

  const { requesterId, categoryId, relatedSystemId, summary, description, requestedPriority } =
    req.body as {
      requesterId: number
      categoryId: number
      relatedSystemId: number
      summary: string
      description: string
      requestedPriority: string
    }

  try {
    const requester = await prisma.devRequester.findUnique({ where: { id: requesterId } })
    if (!requester || !requester.isActive) {
      return res.status(404).json({ error: 'Requester not found' })
    }
    const category = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!category) return res.status(404).json({ error: 'Category not found' })

    const relatedSystem = await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } })
    if (!relatedSystem) return res.status(404).json({ error: 'Related system not found' })

    // BR-01: sequential Ticket Number, backed by a real count — retry once on
    // the rare unique-constraint race (two concurrent requests computing the
    // same "next" number before either insert commits).
    for (let attempt = 0; attempt < 3; attempt++) {
      const ticketNumber = await generateTicketNumber(prisma)
      try {
        const ticket = await prisma.ticket.create({
          data: {
            ticketNumber,
            requesterId,
            categoryId,
            relatedSystemId,
            summary: summary.trim(),
            description: description.trim(),
            requestedPriority,
          },
        })
        return res.status(201).json(ticket)
      } catch (err) {
        const isUniqueConflict =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
        if (!isUniqueConflict || attempt === 2) throw err
        // else: loop and try the next generated number
      }
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to create ticket' })
  }
})

export default app
