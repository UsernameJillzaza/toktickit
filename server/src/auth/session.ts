import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { prisma } from '../db'

export const SESSION_COOKIE = 'tt_session'
// spec D-04: absolute 8-hour lifetime (one working shift), no sliding renewal.
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000

// spec D-03: the DB only ever stores SHA-256(token). A leaked Session table
// can't be replayed as a cookie, because the cookie needs the pre-image.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  return token
}

// BR-11 / D-05: HttpOnly (JS can't read it), SameSite=Lax (not sent on
// cross-site POSTs — the CSRF mitigation), Secure only in production because
// local development runs over plain http.
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS,
  })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

// Minimal Cookie-header parser — avoids a cookie-parser dependency for the
// single cookie this API reads.
export function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = decodeURIComponent(part.slice(eq + 1).trim())
      return /^[0-9a-f]{64}$/.test(value) ? value : null
    }
  }
  return null
}

export async function deleteSessionById(id: string) {
  await prisma.session.deleteMany({ where: { id } })
}

// BR-13 / BR-35: deactivation and admin password resets end every session of
// that user; a successful self-service password change keeps only the
// current one (`exceptId`).
export async function deleteUserSessions(userId: number, exceptId?: string) {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptId ? { id: { not: exceptId } } : {}) },
  })
}
