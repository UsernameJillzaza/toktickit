import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'
import { generateTicketNumber } from './ticketNumber'
import {
  sanitizeFilename,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ACTIVE_ATTACHMENTS_PER_TICKET,
} from './attachmentStorage'

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

function parseIntParam(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback
  const n = Number(value)
  if (!Number.isInteger(n)) return null
  return n
}

// GET /api/tickets — My Tickets list (Lab 2 §6.1, Issue #17). BR-06: always
// scoped to `requesterId` — this is the line that keeps Requester A from
// ever seeing Requester B's tickets. BR-17/BR-18: pageSize capped at 50
// (not an error), default sort createdAt desc with id desc as a stable
// secondary sort.
app.get('/api/tickets', async (req, res) => {
  const requesterId = parseIntParam(req.query.requesterId, NaN)
  if (requesterId === null || Number.isNaN(requesterId)) {
    return res.status(400).json({ error: 'requesterId is required' })
  }

  const page = parseIntParam(req.query.page, 1)
  if (page === null || page < 1) {
    return res.status(400).json({ error: 'Invalid page' })
  }

  let pageSize = parseIntParam(req.query.pageSize, 10)
  if (pageSize === null || pageSize < 1) {
    return res.status(400).json({ error: 'Invalid pageSize' })
  }
  if (pageSize > 50) pageSize = 50 // BR-17: cap silently, do not error

  const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'createdAt:desc'
  const sortMatch = /^(createdAt|summary):(asc|desc)$/.exec(sortParam)
  if (!sortMatch) {
    return res.status(400).json({ error: 'Invalid sort' })
  }
  const sortField = sortMatch[1] as 'createdAt' | 'summary'
  const sortDir = sortMatch[2] as 'asc' | 'desc'

  const search = typeof req.query.search === 'string' ? req.query.search : ''
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined
  const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined

  const where = {
    requesterId,
    ...(categoryId ? { categoryId } : {}),
    ...(priority ? { requestedPriority: priority } : {}),
    ...(search
      ? {
          OR: [
            { summary: { contains: search, mode: 'insensitive' as const } },
            { ticketNumber: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const orderBy =
    sortField === 'summary'
      ? [{ summary: sortDir }, { id: 'desc' as const }]
      : [{ createdAt: sortDir }, { id: 'desc' as const }]

  try {
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { name: true } } },
      }),
      prisma.ticket.count({ where }),
    ])
    res.status(200).json({ items, page, pageSize, total })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to list tickets' })
  }
})

// GET /api/tickets/:id — Requester Ticket Detail (Lab 2 §8.5, Issue #18).
// BR-07: not found and wrong-owner return the same 404, so a client can't
// tell the two cases apart.
app.get('/api/tickets/:id', async (req, res) => {
  const id = Number(req.params.id)
  const requesterId = Number(req.query.requesterId)
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: 'requesterId is required' })
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        relatedSystem: { select: { name: true } },
        attachments: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            isRemoved: true,
            removedAt: true,
            createdAt: true,
          },
        },
      },
    })
    if (!ticket || ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: 'Ticket not found' })
    }
    res.status(200).json(ticket)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to load ticket' })
  }
})

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads')

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, String(req.params.id))
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'))
      return
    }
    cb(null, true)
  },
})

function safeUnlink(filePath: string) {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // Best-effort cleanup only — nothing left referencing this path in the
    // DB either way, so a stray file is harmless.
  }
}

// POST /api/tickets/:id/attachments — upload (Lab 2 §4.5, Issue #18).
// BR-12 (type/size/count) is enforced twice: multer's fileFilter/limits for
// type and size, and an explicit count check here for the 5-active cap —
// no single multer option covers "how many rows already exist in the DB".
app.post('/api/tickets/:id/attachments', (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const code = (uploadErr as { code?: string }).code
      const message =
        code === 'LIMIT_FILE_SIZE'
          ? 'File exceeds the 5 MB limit'
          : 'Unsupported file type — only JPG, PNG, WEBP, and PDF are allowed'
      return res.status(400).json({ error: message })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' })
    }

    const ticketId = Number(req.params.id)
    const requesterId = Number(req.query.requesterId ?? req.body.requesterId)
    if (!Number.isInteger(requesterId)) {
      safeUnlink(req.file.path)
      return res.status(400).json({ error: 'requesterId is required' })
    }

    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket || ticket.requesterId !== requesterId) {
        safeUnlink(req.file.path)
        return res.status(404).json({ error: 'Ticket not found' })
      }

      const activeCount = await prisma.attachment.count({ where: { ticketId, isRemoved: false } })
      if (activeCount >= MAX_ACTIVE_ATTACHMENTS_PER_TICKET) {
        safeUnlink(req.file.path)
        return res
          .status(400)
          .json({ error: `A ticket may have at most ${MAX_ACTIVE_ATTACHMENTS_PER_TICKET} active attachments` })
      }

      const attachment = await prisma.attachment.create({
        data: {
          ticketId,
          filename: req.file.originalname,
          storagePath: req.file.path,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        },
      })

      res.status(201).json({
        id: attachment.id,
        ticketId: attachment.ticketId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        isRemoved: attachment.isRemoved,
        createdAt: attachment.createdAt,
      })
    } catch (err) {
      console.error(err)
      safeUnlink(req.file.path)
      res.status(500).json({ error: 'Unable to upload attachment' })
    }
  })
})

// GET /api/attachments/:id — metadata only, visible even when isRemoved
// (BR-15: removed attachments still show metadata, just can't be downloaded).
app.get('/api/attachments/:id', async (req, res) => {
  const id = Number(req.params.id)
  const requesterId = Number(req.query.requesterId)
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: 'requesterId is required' })
  }

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id }, include: { ticket: true } })
    if (!attachment || attachment.ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: 'Attachment not found' })
    }
    res.status(200).json({
      id: attachment.id,
      ticketId: attachment.ticketId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      isRemoved: attachment.isRemoved,
      removedAt: attachment.removedAt,
      createdAt: attachment.createdAt,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to load attachment' })
  }
})

// GET /api/attachments/:id/download — BR-15: a soft-removed attachment 404s
// here even though its metadata is still visible via the endpoint above.
app.get('/api/attachments/:id/download', async (req, res) => {
  const id = Number(req.params.id)
  const requesterId = Number(req.query.requesterId)
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: 'requesterId is required' })
  }

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id }, include: { ticket: true } })
    if (!attachment || attachment.ticket.requesterId !== requesterId || attachment.isRemoved) {
      return res.status(404).json({ error: 'Attachment not found' })
    }
    res.download(attachment.storagePath, attachment.filename)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to download attachment' })
  }
})

// POST /api/attachments/:id/remove — soft-remove only (BR-14). Idempotent
// guard: removing an already-removed attachment is a 409, not a silent 200.
app.post('/api/attachments/:id/remove', async (req, res) => {
  const id = Number(req.params.id)
  const { requesterId, reason } = req.body as { requesterId?: unknown; reason?: unknown }

  if (typeof requesterId !== 'number') {
    return res.status(400).json({ error: 'requesterId is required' })
  }
  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return res.status(400).json({ error: 'reason must be at least 5 characters' })
  }

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id }, include: { ticket: true } })
    if (!attachment || attachment.ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: 'Attachment not found' })
    }
    if (attachment.isRemoved) {
      return res.status(409).json({ error: 'Attachment already removed' })
    }

    const updated = await prisma.attachment.update({
      where: { id },
      data: { isRemoved: true, removedAt: new Date(), removalReason: reason.trim() },
    })
    res.status(200).json({
      id: updated.id,
      isRemoved: updated.isRemoved,
      removedAt: updated.removedAt,
      removalReason: updated.removalReason,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to remove attachment' })
  }
})

export default app
