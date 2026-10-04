import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, passwordPolicyError } from '../../src/auth/password'

// UNIT-01 (BR-09, D-02): scrypt hashing round-trips, salts differ, and the
// stored value never contains the plaintext.
describe('UNIT-01 password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Correct1horse')
    expect(await verifyPassword('Correct1horse', hash)).toBe(true)
    expect(await verifyPassword('Correct1horsf', hash)).toBe(false)
  })

  it('produces a different hash each time for the same password (random salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('Same1password'), hashPassword('Same1password')])
    expect(a).not.toBe(b)
    expect(await verifyPassword('Same1password', a)).toBe(true)
    expect(await verifyPassword('Same1password', b)).toBe(true)
  })

  it('stores parameters + salt + key, never the plaintext', async () => {
    const hash = await hashPassword('Visible1secret')
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(hash).not.toContain('Visible1secret')
  })

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything1', 'not-a-hash')).toBe(false)
  })
})

// UNIT-02 (BR-10, AC-08): policy boundaries.
describe('UNIT-02 password policy', () => {
  it('accepts exactly 8 and exactly 72 characters', () => {
    expect(passwordPolicyError('abcdefg1')).toBeNull()
    expect(passwordPolicyError('a1'.repeat(36))).toBeNull()
  })

  it('rejects 7 and 73 characters', () => {
    expect(passwordPolicyError('abcdef1')).toMatch(/at least 8/)
    expect(passwordPolicyError('a1'.repeat(36) + 'x')).toMatch(/at most 72/)
  })

  it('requires at least one letter and at least one number', () => {
    expect(passwordPolicyError('12345678')).toMatch(/letter/)
    expect(passwordPolicyError('abcdefgh')).toMatch(/number/)
  })

  it('rejects a password equal to the email, ignoring case and surrounding spaces', () => {
    expect(passwordPolicyError('Pim1@x.test', 'pim1@x.test')).toMatch(/email/)
    expect(passwordPolicyError('other1pass', 'pim1@x.test')).toBeNull()
  })

  it('rejects non-string input', () => {
    expect(passwordPolicyError(undefined)).toMatch(/required/)
    expect(passwordPolicyError(12345678)).toMatch(/required/)
  })
})
