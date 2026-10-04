// Client mirror of server/src/auth/password.ts `passwordPolicyError` (BR-10).
// The server is the authority — this copy only exists so the user gets the
// message before a round trip. Keep the wording identical to the server's.
export const PASSWORD_POLICY_SUMMARY =
  '8–72 characters · at least one letter · at least one number · not your email'

export function passwordPolicyError(password: string, email?: string): string | null {
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password.length > 72) return 'Password must be at most 72 characters.'
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'Password must not be the same as your email.'
  }
  return null
}
