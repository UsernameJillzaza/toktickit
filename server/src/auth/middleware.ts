import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../db'
import { sendError } from '../http'
import type { Role } from '../generated/prisma/client'
import { deleteSessionById, hashToken, readSessionToken } from './session'

export type AuthUser = {
  id: number
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
    sessionId?: string
  }
}

export function publicUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}

// Runs on every request. Never rejects — it only attaches `req.user` when the
// cookie maps to a live session of an active user. Rejection is the job of
// requireAuth/requireRole, so public endpoints keep working without a cookie.
// BR-13: the user row is re-read on every request, so a deactivation or role
// change takes effect immediately rather than when the session expires.
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = readSessionToken(req)
  if (!token) return next()

  const id = hashToken(token)
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } })
  if (!session) return next()

  if (session.expiresAt.getTime() <= Date.now()) {
    await deleteSessionById(id) // BR-11: expired = unauthenticated, clean up the row
    return next()
  }
  if (!session.user.isActive) return next()

  req.user = publicUser(session.user)
  req.sessionId = id
  next()
}

type RequireOptions = { allowPasswordChangePending?: boolean }

// BR-16: 401 when not signed in. BR-02: a user who still has an initial
// password gets 403 PASSWORD_CHANGE_REQUIRED from everything except the
// handful of endpoints that pass allowPasswordChangePending.
export function requireAuth(options: RequireOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return sendError(res, 401, 'Authentication required.', 'UNAUTHENTICATED')
    if (req.user.mustChangePassword && !options.allowPasswordChangePending) {
      return sendError(
        res,
        403,
        'You must change your password before continuing.',
        'PASSWORD_CHANGE_REQUIRED',
      )
    }
    next()
  }
}

// BR-15/BR-16: the role check runs BEFORE any resource lookup, so a 403
// never depends on — and never reveals — whether the target resource exists.
export function requireRole(...roles: Role[]) {
  const auth = requireAuth()
  return (req: Request, res: Response, next: NextFunction) => {
    auth(req, res, () => {
      if (!roles.includes(req.user!.role)) {
        return sendError(
          res,
          403,
          'You do not have permission to perform this action.',
          'FORBIDDEN',
        )
      }
      next()
    })
  }
}
