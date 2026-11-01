import { Router } from 'express'
import type { Response } from 'express'
import { prisma } from '../db'
import { parseId, sendError } from '../http'
import { requireRole } from '../auth/middleware'
import type { Prisma, TicketStatus } from '../generated/prisma/client'
import { isWorkable } from '../tickets/workflow'
import * as v from './validation'

// Actions Taken (Lab 4 L4-2; spec BR-01 … BR-17, api-spec.md "Actions Taken").
//
// Order of checks on every endpoint, as api-spec.md promises:
//   authenticate → password gate → role (403) → input SHAPE (400) → lookup (404)
//   → state and concurrency (409) → FIELD rules (400).
// Every write runs in one transaction that first locks the Ticket row, like
// Lab 3's mutateTicket, so two writers can never both pass a check against
// data the other has just changed (this is also what lets L4-3's resolution
// gate trust the counts it reads).

export const ACTION_SELECT = {
  id: true,
  ticketId: true,
  actionAt: true,
  description: true,
  result: true,
  status: true,
  followUpRequired: true,
  followUpNote: true,
  attachmentNotes: true,
  version: true,
  performedBy: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const

// BR-12: stable order — id breaks ties between equal times.
const ORDER = [{ actionAt: 'asc' as const }, { id: 'asc' as const }]

class ActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

const notFound = (what: string) => new ActionError(404, 'NOT_FOUND', `${what} not found`)
const notWorkable = () =>
  new ActionError(409, 'TICKET_NOT_WORKABLE', 'This ticket is resolved, closed or cancelled — reopen it before changing its actions.')
const isFinal = () => new ActionError(409, 'ACTION_FINAL', 'This action is completed or cancelled and can no longer change.')
const stale = () =>
  new ActionError(409, 'STALE_UPDATE', 'This action was changed by someone else. Reload to see the latest.')
const invalid = (e: v.FieldError) => new ActionError(400, 'VALIDATION_ERROR', e.message, e.field)
const badPerformer = () =>
  new ActionError(400, 'PERFORMER_INVALID', 'Choose an active IT Staff member or Administrator.', 'performedById')

/** Unwraps a field check or throws the 400 it describes. */
function need<T>(checked: v.Checked<T>): T {
  if (!checked.ok) throw invalid(checked.error)
  return checked.value
}

function send(res: Response, err: unknown, fallback: string) {
  if (err instanceof ActionError) return sendError(res, err.status, err.message, err.code, err.field)
  console.error(err)
  return sendError(res, 500, fallback, 'SERVER_ERROR')
}

type Tx = Prisma.TransactionClient

// mergeParams routers don't see the parent's :id in their request type, so
// read path parameters through one tiny helper instead of casting everywhere.
const param = (req: { params: unknown }, name: 'id' | 'actionId') => (req.params as Record<string, string | undefined>)[name]

/** Locks the Ticket row for the whole transaction, then hands over its status. */
async function withLockedTicket<T>(
  ticketId: number,
  work: (tx: Tx, ticket: { id: number; currentStatus: TicketStatus }) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, currentStatus: true } })
    if (!ticket) throw notFound('Ticket')
    return work(tx, ticket)
  })
}

/** BR-03: performer = an active IT Staff member or Administrator. */
async function checkPerformer(tx: Tx, raw: unknown): Promise<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw invalid({ field: 'performedById', message: 'performedById must be a whole number.' })
  }
  const user = await tx.user.findUnique({ where: { id: raw }, select: { isActive: true, role: true } })
  if (!user || !user.isActive || (user.role !== 'IT_STAFF' && user.role !== 'ADMIN')) throw badPerformer()
  return raw
}

/** BR-17: every successful change moves the Ticket's Last Updated. */
const touchTicket = (tx: Tx, ticketId: number) => tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } })

// ---------------------------------------------------------------------------
// IT Staff / Administrator: /api/staff/tickets/:id/actions (mounted on the
// staff router, whose requireRole(IT_STAFF, ADMIN) has already run — BR-14).
// ---------------------------------------------------------------------------

export const actionsRouter = Router({ mergeParams: true })

// GET — the list, in stable order, plus whether the Ticket can still change.
actionsRouter.get('/', async (req, res) => {
  const ticketId = parseId(param(req, 'id'))
  try {
    const ticket = ticketId === null ? null : await prisma.ticket.findUnique({ where: { id: ticketId }, select: { currentStatus: true } })
    if (!ticket) throw notFound('Ticket')
    const actions = await prisma.actionTaken.findMany({ where: { ticketId: ticketId! }, orderBy: ORDER, select: ACTION_SELECT })
    res.status(200).json({ ticketStatus: ticket.currentStatus, workable: isWorkable(ticket.currentStatus), actions })
  } catch (err) {
    send(res, err, 'Unable to load the actions.')
  }
})

const CREATE_FIELDS = ['requestKey', 'description', 'actionAt', 'performedById', 'followUpRequired', 'followUpNote', 'attachmentNotes']

// POST — create. A repeated requestKey returns the existing Action (BR-16).
actionsRouter.post('/', async (req, res) => {
  try {
    const shape = need(v.checkShape(req.body, CREATE_FIELDS))
    const requestKey = need(v.checkRequestKey(shape.requestKey))
    const ticketId = parseId(param(req, 'id'))
    if (ticketId === null) throw notFound('Ticket')

    const out = await withLockedTicket(ticketId, async (tx, ticket) => {
      const existing = await tx.actionTaken.findFirst({ where: { ticketId, requestKey }, select: ACTION_SELECT })
      if (existing) return { created: false, action: existing }
      if (!isWorkable(ticket.currentStatus)) throw notWorkable()

      const description = need(v.checkDescription(shape.description))
      const actionAt = shape.actionAt === undefined ? new Date() : need(v.checkActionAt(shape.actionAt))
      const followUp = need(v.checkFollowUp(shape.followUpRequired, shape.followUpNote))
      const attachmentNotes = need(v.checkAttachmentNotes(shape.attachmentNotes))
      const performedById = shape.performedById === undefined ? req.user!.id : await checkPerformer(tx, shape.performedById)

      const action = await tx.actionTaken.create({
        data: { ticketId, requestKey, description, actionAt, attachmentNotes, ...followUp, performedById, createdById: req.user!.id },
        select: ACTION_SELECT,
      })
      await touchTicket(tx, ticketId)
      return { created: true, action }
    })
    res.status(out.created ? 201 : 200).json(out.action)
  } catch (err) {
    send(res, err, 'Unable to save the action.')
  }
})

type Loaded = { id: number; status: 'OPEN' | 'COMPLETED' | 'CANCELLED'; version: number; description: string; actionAt: Date; result: string | null; followUpRequired: boolean; followUpNote: string | null; attachmentNotes: string | null }

/**
 * Shared front half of edit / complete / cancel, after the Ticket is locked:
 * 404 → final → not workable → stale. (api-spec.md: that is the order.)
 */
async function loadForChange(tx: Tx, ticketStatus: TicketStatus, ticketId: number, actionId: number, version: number): Promise<Loaded> {
  const action = await tx.actionTaken.findFirst({ where: { id: actionId, ticketId } })
  if (!action) throw notFound('Action')
  if (action.status !== 'OPEN') throw isFinal()
  if (!isWorkable(ticketStatus)) throw notWorkable()
  if (action.version !== version) throw stale()
  return action
}

const EDIT_FIELDS = ['version', 'description', 'actionAt', 'performedById', 'followUpRequired', 'followUpNote', 'attachmentNotes', 'result']

// PATCH — edit an Open Action; only the fields that are sent change.
actionsRouter.patch('/:actionId', async (req, res) => {
  try {
    const shape = need(v.checkShape(req.body, EDIT_FIELDS))
    const version = need(v.checkVersion(shape.version))
    const ticketId = parseId(param(req, 'id'))
    const actionId = parseId(param(req, 'actionId'))
    if (ticketId === null || actionId === null) throw notFound(ticketId === null ? 'Ticket' : 'Action')

    const action = await withLockedTicket(ticketId, async (tx, ticket) => {
      const current = await loadForChange(tx, ticket.currentStatus, ticketId, actionId, version)
      const data: Prisma.ActionTakenUncheckedUpdateInput = {}
      if (shape.description !== undefined) data.description = need(v.checkDescription(shape.description))
      if (shape.actionAt !== undefined) data.actionAt = need(v.checkActionAt(shape.actionAt))
      if (shape.attachmentNotes !== undefined) data.attachmentNotes = need(v.checkAttachmentNotes(shape.attachmentNotes))
      if (shape.result !== undefined) data.result = need(v.checkDraftResult(shape.result))
      if (shape.performedById !== undefined) data.performedById = await checkPerformer(tx, shape.performedById)

      // BR-06 on the merged result. Unticking follow-up clears the note on its own.
      if (shape.followUpRequired !== undefined || shape.followUpNote !== undefined) {
        const required = shape.followUpRequired !== undefined ? shape.followUpRequired : current.followUpRequired
        const note = shape.followUpNote !== undefined ? shape.followUpNote : required === false ? undefined : current.followUpNote
        Object.assign(data, need(v.checkFollowUp(required, note)))
      }

      if (Object.keys(data).length === 0) {
        throw invalid({ field: 'body', message: 'Send at least one field to change.' })
      }
      const updated = await tx.actionTaken.update({
        where: { id: actionId },
        data: { ...data, version: { increment: 1 } },
        select: ACTION_SELECT,
      })
      await touchTicket(tx, ticketId)
      return updated
    })
    res.status(200).json(action)
  } catch (err) {
    send(res, err, 'Unable to save the action.')
  }
})

/** complete and cancel differ only in the target status and the word for `result`. */
function finish(target: 'COMPLETED' | 'CANCELLED', label: string) {
  return async (req: Parameters<Parameters<typeof actionsRouter.post>[1]>[0], res: Response) => {
    try {
      const shape = need(v.checkShape(req.body, ['version', 'result']))
      const version = need(v.checkVersion(shape.version))
      const ticketId = parseId(param(req, 'id'))
      const actionId = parseId(param(req, 'actionId'))
      if (ticketId === null || actionId === null) throw notFound(ticketId === null ? 'Ticket' : 'Action')

      const action = await withLockedTicket(ticketId, async (tx, ticket) => {
        await loadForChange(tx, ticket.currentStatus, ticketId, actionId, version)
        const result = need(v.checkResult(shape.result, label))
        const updated = await tx.actionTaken.update({
          where: { id: actionId },
          data: { status: target, result, version: { increment: 1 } },
          select: ACTION_SELECT,
        })
        await touchTicket(tx, ticketId)
        return updated
      })
      res.status(200).json(action)
    } catch (err) {
      send(res, err, 'Unable to save the action.')
    }
  }
}

actionsRouter.post('/:actionId/complete', finish('COMPLETED', 'Result'))
actionsRouter.post('/:actionId/cancel', finish('CANCELLED', 'Reason'))

// There is deliberately no DELETE (BR-10): the record of work only grows.

// ---------------------------------------------------------------------------
// Requester: GET /api/tickets/:id/actions — own Tickets only, read-only.
// ---------------------------------------------------------------------------

export const requesterActionsRouter = Router()

requesterActionsRouter.get('/:id/actions', requireRole('REQUESTER'), async (req, res) => {
  const ticketId = parseId(req.params.id)
  try {
    // Another Requester's Ticket gets the same 404 as a missing one (BR-14).
    const ticket = ticketId === null ? null : await prisma.ticket.findFirst({ where: { id: ticketId, requesterId: req.user!.id }, select: { id: true } })
    if (!ticket) throw notFound('Ticket')
    const actions = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id }, orderBy: ORDER, select: ACTION_SELECT })
    res.status(200).json({ actions })
  } catch (err) {
    send(res, err, 'Unable to load the actions.')
  }
})
