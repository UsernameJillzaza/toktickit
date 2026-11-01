import { Router } from 'express'
import { prisma } from '../db'
import { requireRole } from '../auth/middleware'
import { ALL_STATUSES, isTerminal } from '../tickets/workflow'
import type { Priority, Role, TicketStatus } from '../generated/prisma/client'

// Lab 4 dashboards (specification BR-25 … BR-31, api-spec "Dashboards").
// Everything is counted by the database on every request: no cache, no
// whole-collection reads, at most LIST_SIZE rows per list. Each definition
// below is the one written in BR-26, so a reader can hold the two side by side.

export const dashboardRouter = Router()

const LIST_SIZE = 5
const RESOLVED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // BR-27: 30 × 24 hours, rolling
const ACTION_TEXT_MAX = 120

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const ROLES: Role[] = ['REQUESTER', 'IT_STAFF', 'ADMIN']

const TERMINAL: TicketStatus[] = ALL_STATUSES.filter(isTerminal)
/** BR-26 "Open (Requester view)": not Resolved, Closed or Cancelled. */
const NOT_OPEN: TicketStatus[] = ['RESOLVED', ...TERMINAL]

/** A count for every key, 0 where the database returned nothing (BR-29). */
function filled<K extends string>(keys: readonly K[], found: Array<{ key: K; n: number }>): Record<K, number> {
  const out = {} as Record<K, number>
  for (const key of keys) out[key] = found.find((f) => f.key === key)?.n ?? 0
  return out
}

/** Cut to at most `max` characters (not UTF-16 units), ending in "…" when cut. */
export function cut(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`
}

const newestFirst = [{ updatedAt: 'desc' as const }, { id: 'desc' as const }]

// GET /api/dashboard/requester — only the signed-in Requester's Tickets (BR-28).
dashboardRouter.get('/requester', requireRole('REQUESTER'), async (req, res, next) => {
  try {
    const mine = { requesterId: req.user!.id }
    const brief = { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true } as const
    const row = (t: { id: number; ticketNumber: string; summary: string; currentStatus: TicketStatus; updatedAt: Date }) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      status: t.currentStatus,
      updatedAt: t.updatedAt,
    })
    const now = new Date()
    const windowStart = new Date(now.getTime() - RESOLVED_WINDOW_MS)

    const [open, waitingForYou, resolvedLast30Days, needsAttention, recentlyUpdated] = await Promise.all([
      prisma.ticket.count({ where: { ...mine, currentStatus: { notIn: NOT_OPEN } } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: 'WAITING_FOR_REQUESTER' } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: { in: ['RESOLVED', 'CLOSED'] }, updatedAt: { gte: windowStart } } }),
      prisma.ticket.findMany({ where: { ...mine, currentStatus: 'WAITING_FOR_REQUESTER' }, orderBy: newestFirst, take: LIST_SIZE, select: brief }),
      prisma.ticket.findMany({ where: mine, orderBy: newestFirst, take: LIST_SIZE, select: brief }),
    ])

    res.status(200).json({
      generatedAt: now.toISOString(),
      metrics: { open, waitingForYou, resolvedLast30Days },
      needsAttention: needsAttention.map(row),
      recentlyUpdated: recentlyUpdated.map(row),
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/staff — IT Staff and Administrators (BR-31 adds `users`).
dashboardRouter.get('/staff', requireRole('IT_STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const me = req.user!
    // BR-26 "Active": the Lab 3 queue default, i.e. not Closed and not Cancelled.
    const active = { currentStatus: { notIn: TERMINAL } }
    const brief = {
      id: true,
      ticketNumber: true,
      summary: true,
      currentStatus: true,
      itPriority: true,
      updatedAt: true,
      owner: { select: { id: true, name: true } },
    } as const
    type Brief = {
      id: number
      ticketNumber: string
      summary: string
      currentStatus: TicketStatus
      itPriority: Priority
      updatedAt: Date
      owner: { id: number; name: string } | null
    }
    const row = (t: Brief) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      status: t.currentStatus,
      itPriority: t.itPriority,
      owner: t.owner,
      updatedAt: t.updatedAt,
    })

    const [unassigned, myActive, requesterReportsResolved, statusCounts, priorityCounts, urgent, recentlyUpdated, actions, userCounts] =
      await Promise.all([
        prisma.ticket.count({ where: { ...active, ownerId: null } }),
        prisma.ticket.count({ where: { ...active, ownerId: me.id } }),
        prisma.ticket.count({ where: { ...active, requesterResolvedAt: { not: null } } }),
        prisma.ticket.groupBy({ by: ['currentStatus'], _count: { _all: true } }),
        prisma.ticket.groupBy({ by: ['itPriority'], where: active, _count: { _all: true } }),
        prisma.ticket.findMany({ where: { ...active, itPriority: 'CRITICAL' }, orderBy: newestFirst, take: LIST_SIZE, select: brief }),
        prisma.ticket.findMany({ orderBy: newestFirst, take: LIST_SIZE, select: brief }),
        prisma.actionTaken.findMany({
          where: { performedById: me.id },
          orderBy: [{ actionAt: 'desc' }, { id: 'desc' }],
          take: LIST_SIZE,
          select: { id: true, ticketId: true, description: true, status: true, actionAt: true, ticket: { select: { ticketNumber: true } } },
        }),
        me.role === 'ADMIN'
          ? Promise.all([
              prisma.user.count(),
              prisma.user.count({ where: { isActive: true } }),
              prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
            ])
          : Promise.resolve(null),
      ])

    const body: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      metrics: { unassigned, myActive, requesterReportsResolved },
      byStatus: filled(ALL_STATUSES, statusCounts.map((r) => ({ key: r.currentStatus, n: r._count._all }))),
      byItPriority: filled(PRIORITIES, priorityCounts.map((r) => ({ key: r.itPriority, n: r._count._all }))),
      urgent: urgent.map(row),
      recentlyUpdated: recentlyUpdated.map(row),
      myRecentActions: actions.map((a) => ({
        id: a.id,
        ticketId: a.ticketId,
        ticketNumber: a.ticket.ticketNumber,
        description: cut(a.description, ACTION_TEXT_MAX),
        status: a.status,
        actionAt: a.actionAt,
      })),
    }
    if (userCounts) {
      const [total, activeUsers, byRole] = userCounts
      body.users = {
        total,
        active: activeUsers,
        inactive: total - activeUsers,
        byRole: filled(ROLES, byRole.map((r) => ({ key: r.role, n: r._count._all }))),
      }
    }
    res.status(200).json(body)
  } catch (err) {
    next(err)
  }
})
