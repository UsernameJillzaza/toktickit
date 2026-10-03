import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { prisma } from './db'
import { parseId, sendError } from './http'
import { authenticate, requireRole } from './auth/middleware'
import { authRouter } from './auth/routes'
import { generateTicketNumber } from './ticketNumber'
import {
  sanitizeFilename,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ACTIVE_ATTACHMENTS_PER_TICKET,
} from './attachmentStorage'

// The Express app is defined here and exported WITHOUT calling listen(),
// so tests (Supertest) can import it directly. server.ts owns listen().
const app = express()

app.use(express.json())

// Lab 3: attach req.user from the session cookie on every request (never
// rejects on its own — see auth/middleware.ts), then the auth endpoints.
app.use(authenticate)
app.use('/api/auth', authRouter)

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

// Lab 3 (spec 5.1, BR-03): identity comes from the session only. Any
// `requesterId` a client still sends is ignored. The role check runs before
// any lookup, so a 403 says nothing about whether the resource exists.
const requesterOnly = requireRole('REQUESTER')
const anySignedInRole = requireRole('REQUESTER', 'IT_STAFF', 'ADMIN')

/** A Requester may only touch their own Tickets; IT Staff / Admin may read any (5.1). */
function canReadTicket(user: { id: number; role: string }, ticket: { requesterId: number }) {
  return user.role !== 'REQUESTER' || ticket.requesterId === user.id
}

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
  if (typeof b.categoryId !== 'number') {
    return { field: 'categoryId', message: 'categoryId is required.' }
  }
  if (typeof b.relatedSystemId !== 'number') {
    return { field: 'relatedSystemId', message: 'relatedSystemId is required.' }
  }
  return null
}

// POST /api/tickets — Create Ticket (Lab 2 §4.4, §6, Issue #16). BR-08/BR-09
// validate input; BR-01 generates the Ticket Number; a missing FK (category,
// related system) is a 404, not a 400 — the request shape was fine, the
// referenced resource just doesn't exist. Lab 3: the requester is always the
// signed-in user (BR-03), so there is no requester lookup any more.
app.post('/api/tickets', requesterOnly, async (req, res) => {
  const validationError = validateTicketInput(req.body)
  if (validationError) {
    return sendError(res, 400, validationError.message, 'VALIDATION_ERROR', validationError.field)
  }

  const requesterId = req.user!.id
  const { categoryId, relatedSystemId, summary, description, requestedPriority } =
    req.body as {
      categoryId: number
      relatedSystemId: number
      summary: string
      description: string
      requestedPriority: string
    }

  try {
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
// scoped to the signed-in requester — this is the line that keeps Requester
// A from ever seeing Requester B's tickets. BR-17/BR-18: pageSize capped at
// 50 (not an error), default sort createdAt desc with id desc as a stable
// secondary sort.
app.get('/api/tickets', requesterOnly, async (req, res) => {
  const requesterId = req.user!.id

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
app.get('/api/tickets/:id', requesterOnly, async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
  const requesterId = req.user!.id

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
      return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
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
// The role check runs before multer, so a 401/403 never writes a file.
app.post('/api/tickets/:id/attachments', requesterOnly, (req, res) => {
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

    const ticketId = parseId(req.params.id)
    const requesterId = req.user!.id

    try {
      const ticket = ticketId === null ? null : await prisma.ticket.findUnique({ where: { id: ticketId } })
      if (!ticket || ticket.requesterId !== requesterId) {
        safeUnlink(req.file.path)
        return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
      }

      const activeCount = await prisma.attachment.count({ where: { ticketId: ticket.id, isRemoved: false } })
      if (activeCount >= MAX_ACTIVE_ATTACHMENTS_PER_TICKET) {
        safeUnlink(req.file.path)
        return res
          .status(400)
          .json({ error: `A ticket may have at most ${MAX_ACTIVE_ATTACHMENTS_PER_TICKET} active attachments` })
      }

      const attachment = await prisma.attachment.create({
        data: {
          ticketId: ticket.id,
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
// Lab 3: IT Staff / Admin may read attachments on any Ticket (5.1).
app.get('/api/attachments/:id', anySignedInRole, async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) return sendError(res, 404, 'Attachment not found', 'NOT_FOUND')

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id }, include: { ticket: true } })
    if (!attachment || !canReadTicket(req.user!, attachment.ticket)) {
      return sendError(res, 404, 'Attachment not found', 'NOT_FOUND')
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
app.get('/api/attachments/:id/download', anySignedInRole, async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) return sendError(res, 404, 'Attachment not found', 'NOT_FOUND')

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id }, include: { ticket: true } })
    if (!attachment || !canReadTicket(req.user!, attachment.ticket) || attachment.isRemoved) {
      return sendError(res, 404, 'Attachment not found', 'NOT_FOUND')
    }
    res.download(attachment.storagePath, attachment.filename)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to download attachment' })
  }
})

// POST /api/attachments/:id/remove — soft-remove only (BR-14). Idempotent
// guard: removing an already-removed attachment is a 409, not a silent 200.
app.post('/api/attachments/:id/remove', requesterOnly, async (req, res) => {
  const id = parseId(req.params.id)
  const { reason } = (req.body ?? {}) as { reason?: unknown }
  const requesterId = req.user!.id

  if (typeof reason !== 'string' || reason.trim().length < 5) {
    return sendError(res, 400, 'reason must be at least 5 characters', 'VALIDATION_ERROR', 'reason')
  }

  try {
    const attachment = id === null ? null : await prisma.attachment.findUnique({ where: { id }, include: { ticket: true } })
    if (!attachment || attachment.ticket.requesterId !== requesterId) {
      return sendError(res, 404, 'Attachment not found', 'NOT_FOUND')
    }
    if (attachment.isRemoved) {
      return res.status(409).json({ error: 'Attachment already removed' })
    }

    const updated = await prisma.attachment.update({
      where: { id: attachment.id },
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

// Unknown /api routes answer in the standard JSON error shape instead of
// Express's HTML page — this is also what removed endpoints such as
// GET /api/requesters (BR-42) now return.
app.use('/api', (_req, res) => {
  sendError(res, 404, 'Not found', 'NOT_FOUND')
})

// Last-resort error handler (Express 5 forwards rejected async handlers here).
// Malformed JSON is the client's fault → 400, not 500. Anything else is
// logged server-side and answered with a safe, detail-free message.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return sendError(res, 400, 'Malformed JSON body.', 'VALIDATION_ERROR')
  }
  console.error(err)
  return sendError(res, 500, 'Unexpected server error.', 'SERVER_ERROR')
})

export default app
