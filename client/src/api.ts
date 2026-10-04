// Thin wrapper over fetch for calls made while signed in. A 401 means the
// session is gone (expired, logged out elsewhere, or the account was
// deactivated — BR-11, BR-13). Instead of every screen handling that, the
// wrapper announces it and AuthProvider returns the user to Login.
// The response is still handed back, so the caller's own error path runs too.

export const SESSION_ENDED_EVENT = 'tt:session-ended'

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) window.dispatchEvent(new Event(SESSION_ENDED_EVENT))
  return res
}
