import { Router } from 'express'
import type { Response } from 'express'
import { prisma } from '../db'
import { parseId, sendError } from '../http'
import { requireRole } from '../auth/middleware'
import type { TicketStatus } from '../generated/prisma/client'
import { isTerminal } from './workflow'

// Public Comments, Internal Notes and "Problem Appears Resolved"
// (FR-09, FR-10, FR-16, FR-17; BR-25 … BR-32).

export const BODY_MAX_LENGTH = 2000

/** BR-28: trimmed, 1–2000 characters. Returns the clean text or null. */
function cleanBody(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const body = raw.trim()
  return body.length >= 1 && body.length <= BODY_MAX_LENGTH ? body : null
}

const badBody = (res: Response) =>
  sendError(res, 400, `Write between 1 and ${BODY_MAX_LENGTH} characters.`, 'VALIDATION_ERROR', 'body')

/** The one shape for both comments and notes (api-spec). */
export const ENTRY_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
} as const

const ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }]

// ---------------------------------------------------------------------------
// Requester-facing: /api/tickets/:id/comments and /resolved-indication
// ---------------------------------------------------------------------------

export const conversationRouter = Router()

const anySignedInRole = requireRole('REQUESTER', 'IT_STAFF', 'ADMIN')
const requesterOnly = requireRole('REQUESTER')

/**
 * The ticket, if this user may see its conversation: a Requester only their
 * own (otherwise the same 404 as "doesn't exist", BR-16); staff any ticket.
 */
async function findVisibleTicket(user: { id: number; role: string }, id: number | null) {
  if (id === null) return null
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, requesterId: true, currentStatus: true },
  })
  if (!ticket) return null
  if (user.role === 'REQUESTER' && ticket.requesterId !== user.id) return null
  return ticket
}

// GET /api/tickets/:id/comments — this query only ever touches the
// PublicComment table, never InternalNote (BR-32).
conversationRouter.get('/:id/comments', anySignedInRole, async (req, res) => {
  try {
    const ticket = await findVisibleTicket(req.user!, parseId(req.params.id))
    if (!ticket) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
    const comments = await prisma.publicComment.findMany({
      where: { ticketId: ticket.id },
      orderBy: ORDER,
      select: ENTRY_SELECT,
    })
    res.status(200).json(comments)
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to load comments.', 'SERVER_ERROR')
  }
})

// POST /api/tickets/:id/comments — author and time come from the server,
// whatever the client sends (BR-29).
conversationRouter.post('/:id/comments', anySignedInRole, async (req, res) => {
  const body = cleanBody(req.body?.body)
  if (body === null) return badBody(res)
  try {
    const ticket = await findVisibleTicket(req.user!, parseId(req.params.id))
    if (!ticket) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
    if (isTerminal(ticket.currentStatus)) {
      return sendError(res, 409, 'Comments cannot be added to a closed or cancelled ticket.', 'TICKET_CLOSED')
    }
    const [comment] = await prisma.$transaction([
      prisma.publicComment.create({
        data: { ticketId: ticket.id, authorId: req.user!.id, body },
        select: ENTRY_SELECT,
      }),
      prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } }), // BR-26
    ])
    res.status(201).json(comment)
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to post the comment.', 'SERVER_ERROR')
  }
})

// BR-25: statuses where the requester may say "it seems fixed".
const INDICATION_STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']

// POST /api/tickets/:id/resolved-indication — records the time only; the
// status never changes (BR-05, BR-25).
conversationRouter.post('/:id/resolved-indication', requesterOnly, async (req, res) => {
  const id = parseId(req.params.id)
  try {
    const ticket = id === null ? null : await prisma.ticket.findFirst({ where: { id, requesterId: req.user!.id } })
    if (!ticket) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
    if (!INDICATION_STATUSES.includes(ticket.currentStatus)) {
      return sendError(res, 409, 'This ticket can no longer be marked as resolved by the requester.', 'INVALID_STATUS')
    }
    // Conditional update: two presses arriving together can't both succeed,
    // because only one finds requesterResolvedAt still empty.
    const { count } = await prisma.ticket.updateMany({
      where: { id: ticket.id, requesterResolvedAt: null, currentStatus: { in: INDICATION_STATUSES } },
      data: { requesterResolvedAt: new Date() },
    })
    if (count === 0) {
      return sendError(res, 409, 'You already reported this problem as resolved.', 'ALREADY_INDICATED')
    }
    const updated = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { id: true, currentStatus: true, requesterResolvedAt: true },
    })
    res.status(200).json(updated)
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to record that.', 'SERVER_ERROR')
  }
})

// ---------------------------------------------------------------------------
// Staff-only: /api/staff/tickets/:id/notes (mounted on the staff router,
// whose requireRole(IT_STAFF, ADMIN) has already run — BR-04).
// ---------------------------------------------------------------------------

export const notesRouter = Router({ mergeParams: true })

notesRouter.get('/', async (req, res) => {
  const id = parseId((req.params as { id?: string }).id)
  try {
    const ticket = id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { id: true } })
    if (!ticket) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
    const notes = await prisma.internalNote.findMany({ where: { ticketId: ticket.id }, orderBy: ORDER, select: ENTRY_SELECT })
    res.status(200).json(notes)
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to load internal notes.', 'SERVER_ERROR')
  }
})

// Internal notes can be added in any status, including closed (BR-31).
notesRouter.post('/', async (req, res) => {
  const body = cleanBody(req.body?.body)
  if (body === null) return badBody(res)
  const id = parseId((req.params as { id?: string }).id)
  try {
    const ticket = id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { id: true } })
    if (!ticket) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
    const [note] = await prisma.$transaction([
      prisma.internalNote.create({ data: { ticketId: ticket.id, authorId: req.user!.id, body }, select: ENTRY_SELECT }),
      prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } }), // BR-26
    ])
    res.status(201).json(note)
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to add the internal note.', 'SERVER_ERROR')
  }
})
