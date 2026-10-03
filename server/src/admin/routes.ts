import { Router } from 'express'
import type { Response } from 'express'
import { prisma } from '../db'
import { parseId, sendError } from '../http'
import { requireRole } from '../auth/middleware'
import { hashPassword, passwordPolicyError } from '../auth/password'
import { deleteUserSessions } from '../auth/session'
import type { Prisma, Role } from '../generated/prisma/client'

// User Management (FR-19 … FR-22, BR-33 … BR-38). Administrators only; the
// role check runs once for the whole router, before any lookup (BR-16).
export const adminRouter = Router()
adminRouter.use(requireRole('ADMIN'))

const ROLES: Role[] = ['REQUESTER', 'IT_STAFF', 'ADMIN']
const EDITABLE_FIELDS = ['name', 'email', 'role', 'isActive'] as const
const EMAIL_MAX = 254
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const

class AdminError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof AdminError) return sendError(res, err.status, err.message, err.code, err.field)
  // Unique email raced past the pre-check (two creates at once).
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
    return sendError(res, 409, 'Another account already uses this email.', 'DUPLICATE_EMAIL', 'email')
  }
  console.error(err)
  return sendError(res, 500, fallback, 'SERVER_ERROR')
}

const invalid = (field: string, message: string) => new AdminError(400, 'VALIDATION_ERROR', message, field)

function checkName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 2 || name.length > 100) throw invalid('name', 'Name must be 2–100 characters.')
  return name
}

/** BR-06: trimmed, lowercased, a plausible address, at most 254 characters. */
function checkEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL_SHAPE.test(email) || email.length > EMAIL_MAX) {
    throw invalid('email', `Enter a valid email address (at most ${EMAIL_MAX} characters).`)
  }
  return email
}

function checkRole(value: unknown): Role {
  if (typeof value !== 'string' || !(ROLES as string[]).includes(value)) {
    throw invalid('role', `Role must be one of: ${ROLES.join(', ')}.`)
  }
  return value as Role
}

function checkActive(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid('isActive', 'isActive must be true or false.')
  return value
}

function checkPassword(value: unknown, email: string): string {
  const problem = passwordPolicyError(value, email)
  if (problem) throw new AdminError(400, 'WEAK_PASSWORD', problem, 'initialPassword')
  return value as string
}

async function ensureEmailFree(db: Prisma.TransactionClient | typeof prisma, email: string, exceptId?: number) {
  const taken = await db.user.findFirst({ where: { email, ...(exceptId ? { id: { not: exceptId } } : {}) } })
  if (taken) throw new AdminError(409, 'DUPLICATE_EMAIL', 'Another account already uses this email.', 'email')
}

// GET /api/admin/users (FR-19) — no pagination (labsheet §8.5).
adminRouter.get('/users', async (req, res) => {
  try {
    const role = req.query.role === undefined || req.query.role === '' ? undefined : checkRole(req.query.role)
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const contains = { contains: search, mode: 'insensitive' as const }
    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(search ? { OR: [{ name: contains }, { email: contains }] } : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: USER_SELECT,
    })
    res.status(200).json(users)
  } catch (err) {
    fail(res, err, 'Unable to load users.')
  }
})

// POST /api/admin/users (FR-20, BR-33) — new users always start with
// mustChangePassword = true.
adminRouter.post('/users', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>
    const name = checkName(b.name)
    const email = checkEmail(b.email)
    const role = checkRole(b.role)
    const isActive = checkActive(b.isActive)
    const password = checkPassword(b.initialPassword, email)
    await ensureEmailFree(prisma, email)

    const user = await prisma.user.create({
      data: { name, email, role, isActive, passwordHash: await hashPassword(password), mustChangePassword: true },
      select: USER_SELECT,
    })
    res.status(201).json(user)
  } catch (err) {
    fail(res, err, 'Unable to create the user.')
  }
})

// PATCH /api/admin/users/:id (FR-21, BR-34, BR-36, BR-37, BR-13).
adminRouter.patch('/users/:id', async (req, res) => {
  const id = parseId(req.params.id)
  try {
    if (id === null) throw new AdminError(404, 'NOT_FOUND', 'User not found')
    const b = (req.body ?? {}) as Record<string, unknown>
    const keys = Object.keys(b)
    const unknown = keys.find((k) => !(EDITABLE_FIELDS as readonly string[]).includes(k))
    if (unknown) throw invalid(unknown, `${unknown} can't be changed here.`)
    if (keys.length === 0) throw invalid('body', 'Nothing to change.')

    const data: Prisma.UserUpdateInput = {}
    if ('name' in b) data.name = checkName(b.name)
    if ('email' in b) data.email = checkEmail(b.email)
    if ('role' in b) data.role = checkRole(b.role)
    if ('isActive' in b) data.isActive = checkActive(b.isActive)

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } })
      if (!current) throw new AdminError(404, 'NOT_FOUND', 'User not found')

      const roleChanges = data.role !== undefined && data.role !== current.role
      const activeChanges = data.isActive !== undefined && data.isActive !== current.isActive

      // BR-36: an admin can rename themselves, but never switch off or
      // demote their own account.
      if (id === req.user!.id && (roleChanges || activeChanges)) {
        throw new AdminError(409, 'SELF_MODIFICATION', "You can't deactivate or change the role of your own account.")
      }

      // BR-37: would this leave no active Administrator? Lock every active
      // admin row first. If two admins remove each other at the same moment,
      // the second transaction waits here, and once the first commits,
      // Postgres re-checks the locked rows against the WHERE clause — it
      // then sees only one active admin and refuses.
      const removesAnAdmin =
        current.role === 'ADMIN' && current.isActive && ((roleChanges && data.role !== 'ADMIN') || data.isActive === false)
      if (removesAnAdmin) {
        const active = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM "User" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`
        if (active.filter((a) => a.id !== id).length === 0) {
          throw new AdminError(409, 'LAST_ADMIN', 'At least one active Administrator must remain.')
        }
      }

      if (typeof data.email === 'string') await ensureEmailFree(tx, data.email, id)
      return tx.user.update({ where: { id }, data, select: USER_SELECT })
    })

    // BR-13: a deactivated account loses every session immediately.
    if (data.isActive === false) await deleteUserSessions(updated.id)
    res.status(200).json(updated)
  } catch (err) {
    fail(res, err, 'Unable to update the user.')
  }
})

// POST /api/admin/users/:id/initial-password (FR-22, BR-35).
adminRouter.post('/users/:id/initial-password', async (req, res) => {
  const id = parseId(req.params.id)
  try {
    const user = id === null ? null : await prisma.user.findUnique({ where: { id } })
    if (!user) throw new AdminError(404, 'NOT_FOUND', 'User not found')
    const password = checkPassword((req.body ?? {}).initialPassword, user.email)

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true },
      select: USER_SELECT,
    })
    await deleteUserSessions(user.id)
    res.status(200).json(updated)
  } catch (err) {
    fail(res, err, 'Unable to set the initial password.')
  }
})
