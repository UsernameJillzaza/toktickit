import { Router } from 'express'
import { prisma } from '../db'
import { sendError } from '../http'
import { getDummyHash, hashPassword, passwordPolicyError, verifyPassword } from './password'
import {
  clearSessionCookie,
  createSession,
  deleteSessionById,
  deleteUserSessions,
  hashToken,
  readSessionToken,
  setSessionCookie,
} from './session'
import { publicUser, requireAuth } from './middleware'

export const authRouter = Router()

const INVALID_CREDENTIALS = 'Invalid email or password.'

// POST /api/auth/login — FR-01. BR-07: unknown email, wrong password and
// "no password issued yet" all produce the identical 401, and BR-08 runs a
// full scrypt verification in every one of those cases (against a dummy hash
// when there's no real one) so timing can't tell them apart either. Only a
// caller who already knows the correct password learns the account is
// inactive (403).
authRouter.post('/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || email.trim() === '') {
    return sendError(res, 400, 'Email is required.', 'VALIDATION_ERROR', 'email')
  }
  if (typeof password !== 'string' || password === '') {
    return sendError(res, 400, 'Password is required.', 'VALIDATION_ERROR', 'password')
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  const hashToCheck = user?.passwordHash ?? (await getDummyHash())
  const passwordMatches = await verifyPassword(password, hashToCheck)

  if (!user || !user.passwordHash || !passwordMatches) {
    return sendError(res, 401, INVALID_CREDENTIALS, 'INVALID_CREDENTIALS')
  }
  if (!user.isActive) {
    return sendError(
      res,
      403,
      'This account is inactive. Contact an administrator.',
      'ACCOUNT_INACTIVE',
    )
  }

  // Signing in again replaces whatever session this browser already had.
  const previous = readSessionToken(req)
  if (previous) await deleteSessionById(hashToken(previous))

  const token = await createSession(user.id)
  setSessionCookie(res, token)
  res.status(200).json({ user: publicUser(user) })
})

// POST /api/auth/logout — FR-02, BR-12: the session row is deleted, so the old
// cookie value is worthless even if someone kept a copy.
authRouter.post('/logout', requireAuth({ allowPasswordChangePending: true }), async (req, res) => {
  await deleteSessionById(req.sessionId!)
  clearSessionCookie(res)
  res.status(204).end()
})

// GET /api/auth/me — FR-03. Allowed while a password change is pending so the
// client can tell where to send the user.
authRouter.get('/me', requireAuth({ allowPasswordChangePending: true }), (req, res) => {
  res.status(200).json({ user: req.user })
})

// POST /api/auth/change-password — FR-04/FR-05, BR-10. On success other
// sessions of this user are ended; the current one stays signed in.
authRouter.post(
  '/change-password',
  requireAuth({ allowPasswordChangePending: true }),
  async (req, res) => {
    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: unknown
      newPassword?: unknown
    }
    if (typeof currentPassword !== 'string' || currentPassword === '') {
      return sendError(
        res,
        400,
        'Current password is required.',
        'VALIDATION_ERROR',
        'currentPassword',
      )
    }
    if (typeof newPassword !== 'string' || newPassword === '') {
      return sendError(res, 400, 'New password is required.', 'VALIDATION_ERROR', 'newPassword')
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
    if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return sendError(
        res,
        400,
        'Current password is incorrect.',
        'VALIDATION_ERROR',
        'currentPassword',
      )
    }

    const policyError = passwordPolicyError(newPassword, user.email)
    if (policyError) return sendError(res, 400, policyError, 'WEAK_PASSWORD', 'newPassword')

    if (newPassword === currentPassword) {
      return sendError(
        res,
        400,
        'New password must be different from your current password.',
        'PASSWORD_REUSE',
        'newPassword',
      )
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    })
    await deleteUserSessions(user.id, req.sessionId)
    res.status(200).json({ user: publicUser(updated) })
  },
)
