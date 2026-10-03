import { Router } from 'express'
import type { Request } from 'express'
import { prisma } from '../db'
import { sendError } from '../http'
import { requireRole } from '../auth/middleware'
import type { Prisma, Priority, TicketStatus } from '../generated/prisma/client'

// IT Staff endpoints (api-spec.md "IT Staff"). Administrators have the same
// ticket permissions (BR-17). The role check runs once, for the whole router,
// before any handler can look anything up (BR-16).
export const staffRouter = Router()
staffRouter.use(requireRole('IT_STAFF', 'ADMIN'))

const STATUSES: TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]
const TERMINAL: TicketStatus[] = ['CLOSED', 'CANCELLED']
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
