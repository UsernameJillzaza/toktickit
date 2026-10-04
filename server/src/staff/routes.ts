import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../db'
import { parseId, sendError } from '../http'
import { notesRouter } from '../tickets/conversation'
import { ALL_STATUSES, allowedTransitions, canTransition, isTerminal, isTicketStatus, OWNER_REQUIRED_STATUSES } from '../tickets/workflow'
import { requireRole } from '../auth/middleware'
import type { Prisma, Priority, TicketStatus } from '../generated/prisma/client'

// IT Staff endpoints (api-spec.md "IT Staff"). Administrators have the same
// ticket permissions (BR-17). The role check runs once, for the whole router,
// before any handler can look anything up (BR-16).
export const staffRouter = Router()
staffRouter.use(requireRole('IT_STAFF', 'ADMIN'))
staffRouter.use('/tickets/:id/notes', notesRouter)

const STATUSES = ALL_STATUSES
const TERMINAL: TicketStatus[] = ALL_STATUSES.filter(isTerminal)
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const SORT_FIELDS = ['createdAt', 'updatedAt', 'itPriority', 'ticketNumber'] as const
type SortField = (typeof SORT_FIELDS)[number]

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

type QueueQuery = {
  where: Prisma.TicketWhereInput
  orderBy: Prisma.TicketOrderByWithRelationInput[]
  page: number
  pageSize: number
}

class QueryError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message)
  }
}

function positiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  if (typeof value !== 'string' || !Number.isInteger(n) || n < 1) {
    throw new QueryError(field, `${field} must be a positive whole number.`)
  }
  return n
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new QueryError(field, `${field} must be one of: ${allowed.join(', ')}.`)
  }
  return value as T
}

// BR-43 / BR-44: turn the query string into a Prisma query, rejecting any
// value we don't recognise instead of silently ignoring it.
function parseQueueQuery(req: Request): QueueQuery {
  const q = req.query
  const and: Prisma.TicketWhereInput[] = []

  const status = q.status === undefined || q.status === '' ? 'active' : q.status
  if (status === 'active') and.push({ currentStatus: { notIn: TERMINAL } })
  else if (status !== 'all') and.push({ currentStatus: oneOf(status, STATUSES, 'status') })

  const owner = q.owner === undefined || q.owner === '' ? 'any' : q.owner
  if (owner === 'me') and.push({ ownerId: req.user!.id })
  else if (owner === 'unassigned') and.push({ ownerId: null })
  else if (owner !== 'any') and.push({ ownerId: positiveInt(owner, 'owner') })

  const priority = oneOf(q.priority, PRIORITIES, 'priority')
  if (priority) and.push({ itPriority: priority })

  const categoryId = positiveInt(q.categoryId, 'categoryId')
  if (categoryId) and.push({ categoryId })

  const search = typeof q.search === 'string' ? q.search.trim() : ''
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const }
    and.push({
      OR: [
        { ticketNumber: contains },
        { summary: contains },
        { requester: { name: contains } },
        { requester: { email: contains } },
      ],
    })
  }

  const sortParam = typeof q.sort === 'string' && q.sort !== '' ? q.sort : 'createdAt:desc'
  const [field, dir, extra] = sortParam.split(':')
  if (extra !== undefined || !(SORT_FIELDS as readonly string[]).includes(field) || (dir !== 'asc' && dir !== 'desc')) {
    throw new QueryError('sort', `sort must be ${SORT_FIELDS.join('|')} : asc|desc.`)
  }
  // A stable tie-breaker so paging never shows a row twice or skips one.
  // itPriority ties fall back to newest first, the queue's default order.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    (field as SortField) === 'itPriority'
      ? [{ itPriority: dir }, { createdAt: 'desc' }, { id: 'desc' }]
      : [{ [field]: dir }, { id: dir }]

  const page = positiveInt(q.page, 'page') ?? 1
  const pageSize = Math.min(positiveInt(q.pageSize, 'pageSize') ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

  return { where: { AND: and }, orderBy, page, pageSize }
}

const QUEUE_ITEM_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  requestedPriority: true,
  itPriority: true,
  createdAt: true,
  updatedAt: true,
  requesterResolvedAt: true,
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true } },
  owner: { select: { id: true, name: true } },
} as const

// GET /api/staff/tickets — Ticket Queue (FR-11).
staffRouter.get('/tickets', async (req, res) => {
  let query: QueueQuery
  try {
    query = parseQueueQuery(req)
  } catch (err) {
    if (err instanceof QueryError) return sendError(res, 400, err.message, 'VALIDATION_ERROR', err.field)
    throw err
  }

  try {
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where: query.where,
        orderBy: query.orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: QUEUE_ITEM_SELECT,
      }),
      prisma.ticket.count({ where: query.where }),
    ])
    res.status(200).json({ items, page: query.page, pageSize: query.pageSize, total })
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to load the ticket queue.', 'SERVER_ERROR')
  }
})

// ---------------------------------------------------------------------------
// Staff Ticket Detail + operations (FR-12 … FR-15)
// ---------------------------------------------------------------------------

const STAFF_DETAIL_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  description: true,
  currentStatus: true,
  requestedPriority: true,
  itPriority: true,
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true } },
  owner: { select: { id: true, name: true, role: true, isActive: true } },
  attachments: {
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, isRemoved: true, removedAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} as const

type Db = Prisma.TransactionClient | typeof prisma

/** The Staff Ticket Detail shape — also the response of every mutation (api-spec). */
async function loadStaffDetail(db: Db, id: number) {
  const ticket = await db.ticket.findUnique({ where: { id }, select: STAFF_DETAIL_SELECT })
  if (!ticket) return null
  return { ...ticket, allowedTransitions: allowedTransitions(ticket.currentStatus) }
}

/** A rule violation inside a mutation; rolls the transaction back. */
class TicketRuleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

const notFound = () => new TicketRuleError(404, 'NOT_FOUND', 'Ticket not found')
const terminal = () =>
  new TicketRuleError(409, 'TICKET_TERMINAL', 'This ticket is closed — ownership, priority and status can no longer change.')
const ownerRequired = (status: TicketStatus) =>
  new TicketRuleError(409, 'OWNER_REQUIRED', `A ticket in ${status} must have an owner.`)

/**
 * Runs one ticket mutation with the ticket row locked (SELECT … FOR UPDATE).
 * Owner and status rules depend on each other (BR-23): without the lock, an
 * unassign and a move to IN_PROGRESS arriving together could each pass their
 * check against the other's stale value, leaving IN_PROGRESS with no owner.
 */
async function mutateTicket(
  req: Request,
  res: Response,
  change: (tx: Prisma.TransactionClient, ticket: { id: number; currentStatus: TicketStatus; ownerId: number | null }) => Promise<Prisma.TicketUpdateInput>,
) {
  const id = parseId(req.params.id)
  if (id === null) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
  try {
    const detail = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`
      const ticket = await tx.ticket.findUnique({ where: { id }, select: { id: true, currentStatus: true, ownerId: true } })
      if (!ticket) throw notFound()
      const data = await change(tx, ticket)
      await tx.ticket.update({ where: { id }, data }) // @updatedAt moves Last Updated (BR-26)
      return loadStaffDetail(tx, id)
    })
    res.status(200).json(detail)
  } catch (err) {
    if (err instanceof TicketRuleError) return sendError(res, err.status, err.message, err.code, err.field)
    console.error(err)
    sendError(res, 500, 'Unable to update the ticket.', 'SERVER_ERROR')
  }
}

// GET /api/staff/tickets/:id — Staff Ticket Detail (FR-12).
staffRouter.get('/tickets/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
  try {
    const detail = await loadStaffDetail(prisma, id)
    if (!detail) return sendError(res, 404, 'Ticket not found', 'NOT_FOUND')
    res.status(200).json(detail)
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to load the ticket.', 'SERVER_ERROR')
  }
})

// GET /api/staff/assignees — who a ticket can be assigned to (BR-18).
staffRouter.get('/assignees', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['IT_STAFF', 'ADMIN'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    })
    res.status(200).json(users)
  } catch (err) {
    console.error(err)
    sendError(res, 500, 'Unable to load assignees.', 'SERVER_ERROR')
  }
})

// PUT /api/staff/tickets/:id/owner — claim / assign / reassign / unassign (FR-13).
staffRouter.put('/tickets/:id/owner', (req, res) => {
  const { ownerId } = (req.body ?? {}) as { ownerId?: unknown }
  if (ownerId !== null && (typeof ownerId !== 'number' || !Number.isInteger(ownerId))) {
    return sendError(res, 400, 'Choose an active IT Staff member or Administrator.', 'ASSIGNEE_INVALID', 'ownerId')
  }
  return mutateTicket(req, res, async (tx, ticket) => {
    if (ownerId !== null) {
      const assignee = await tx.user.findUnique({ where: { id: ownerId }, select: { isActive: true, role: true } })
      if (!assignee || !assignee.isActive || assignee.role === 'REQUESTER') {
        throw new TicketRuleError(400, 'ASSIGNEE_INVALID', 'Choose an active IT Staff member or Administrator.', 'ownerId')
      }
    }
    if (isTerminal(ticket.currentStatus)) throw terminal()
    if (ownerId === null && OWNER_REQUIRED_STATUSES.has(ticket.currentStatus)) throw ownerRequired(ticket.currentStatus)
    return ownerId === null ? { owner: { disconnect: true } } : { owner: { connect: { id: ownerId } } }
  })
})

// PUT /api/staff/tickets/:id/it-priority (FR-14, BR-21). Requested Priority
// is never touched.
staffRouter.put('/tickets/:id/it-priority', (req, res) => {
  const { itPriority } = (req.body ?? {}) as { itPriority?: unknown }
  if (typeof itPriority !== 'string' || !(PRIORITIES as string[]).includes(itPriority)) {
    return sendError(res, 400, `itPriority must be one of: ${PRIORITIES.join(', ')}.`, 'VALIDATION_ERROR', 'itPriority')
  }
  return mutateTicket(req, res, async (_tx, ticket) => {
    if (isTerminal(ticket.currentStatus)) throw terminal()
    return { itPriority: itPriority as Priority }
  })
})

// PUT /api/staff/tickets/:id/status (FR-15, BR-22, BR-23, BR-25).
staffRouter.put('/tickets/:id/status', (req, res) => {
  const { status } = (req.body ?? {}) as { status?: unknown }
  if (!isTicketStatus(status)) {
    return sendError(res, 400, `status must be one of: ${ALL_STATUSES.join(', ')}.`, 'VALIDATION_ERROR', 'status')
  }
  return mutateTicket(req, res, async (_tx, ticket) => {
    if (!canTransition(ticket.currentStatus, status)) {
      throw new TicketRuleError(409, 'INVALID_TRANSITION', `Cannot change status from ${ticket.currentStatus} to ${status}.`)
    }
    if (OWNER_REQUIRED_STATUSES.has(status) && ticket.ownerId === null) throw ownerRequired(status)
    return {
      currentStatus: status,
      // BR-25: reopening means the problem is back, so the requester's
      // "appears resolved" flag no longer applies.
      ...(status === 'REOPENED' ? { requesterResolvedAt: null } : {}),
    }
  })
})
