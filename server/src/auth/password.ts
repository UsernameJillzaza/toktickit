import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

// spec D-02: scrypt from node:crypto — memory-hard, OWASP-acceptable, and no
// native module to compile on Windows (bcrypt/argon2 both need one).
// Parameters are stored inside every hash so they can be raised later
// without invalidating existing passwords.
const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const MAX_MEM = 64 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, keyB64] = parts
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  })
  // Constant-time compare so the response time doesn't leak how many leading
  // bytes matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// BR-08: when the email doesn't exist (or has no password yet) login still
// runs a full scrypt verification against this throwaway hash, so response
// time doesn't reveal whether an account exists. Computed once, lazily.
let dummyHash: Promise<string> | null = null
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  return dummyHash
}

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

// BR-10: 8–72 characters, at least one letter and one number, not the same
// as the account's email. Returns the first violated rule, or null if valid.
// The same rules are mirrored in the client for instant feedback, but this
// server copy is the one that actually protects the data.
export function passwordPolicyError(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Password is required.'
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`
  }
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'Password must not be the same as your email.'
  }
  return null
}
