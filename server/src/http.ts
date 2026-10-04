import type { Response } from 'express'

// api-spec.md "Common Error Responses": every error is
// { error, code?, field? } — a safe, human-readable message plus a stable
// machine code the client can branch on. Never a stack trace or SQL.
export function sendError(
  res: Response,
  status: number,
  error: string,
  code?: string,
  field?: string,
) {
  const body: { error: string; code?: string; field?: string } = { error }
  if (code) body.code = code
  if (field) body.field = field
  return res.status(status).json(body)
}

export function parseId(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}
