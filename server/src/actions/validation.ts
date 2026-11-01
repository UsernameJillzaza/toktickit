// Field rules for an Action Taken (spec BR-04 … BR-09). Pure functions — no
// database, no Express — so the unit tests (UNIT-01) can exercise every rule
// directly. The routes apply them in the order api-spec.md promises: input
// *shape* first, then the lookup and state rules, then these field rules.

export const DESCRIPTION_MAX = 2000
export const RESULT_MAX = 2000
export const FOLLOW_UP_NOTE_MAX = 1000
export const ATTACHMENT_NOTES_MAX = 500
export const REQUEST_KEY_MAX = 64
/** BR-05: how far into the future actionAt may be (clock-skew tolerance). */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

/**
 * The limits in the spec count characters. `String.length` counts UTF-16 units,
 * so an emoji would count as two; count code points instead. (Lab 3's comment
 * and note bodies still count UTF-16 units — a recorded limitation there.)
 */
const charCount = (s: string) => Array.from(s).length

export type FieldError = { field: string; message: string }

/** Either the cleaned value or the first rule that failed. */
export type Checked<T> = { ok: true; value: T } | { ok: false; error: FieldError }

const fail = (field: string, message: string): { ok: false; error: FieldError } => ({
  ok: false,
  error: { field, message },
})

function text(raw: unknown, field: string, label: string, max: number, required: boolean): Checked<string | null> {
  if (raw === undefined || raw === null) {
    return required ? fail(field, `${label} is required.`) : { ok: true, value: null }
  }
  if (typeof raw !== 'string') return fail(field, `${label} must be text.`)
  const value = raw.trim()
  if (value.length === 0) {
    return required ? fail(field, `${label} is required.`) : { ok: true, value: null }
  }
  if (charCount(value) > max) return fail(field, `${label} must be at most ${max} characters.`)
  return { ok: true, value }
}

export const checkDescription = (raw: unknown) =>
  text(raw, 'description', 'Description', DESCRIPTION_MAX, true) as Checked<string>

/** BR-09: the result of a completed Action, or the reason for a cancelled one. */
export const checkResult = (raw: unknown, label = 'Result') =>
  text(raw, 'result', label, RESULT_MAX, true) as Checked<string>

/** A draft result while the Action is still Open: optional. */
export const checkDraftResult = (raw: unknown) => text(raw, 'result', 'Result', RESULT_MAX, false)

export const checkAttachmentNotes = (raw: unknown) =>
  text(raw, 'attachmentNotes', 'Attachment notes', ATTACHMENT_NOTES_MAX, false)

/** BR-05: a real date, not more than five minutes ahead of `now`. */
export function checkActionAt(raw: unknown, now: Date = new Date()): Checked<Date> {
  if (typeof raw !== 'string' || raw.trim() === '') return fail('actionAt', 'Action date and time must be a date.')
  const when = new Date(raw)
  if (Number.isNaN(when.getTime())) return fail('actionAt', 'Action date and time must be a date.')
  if (when.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return fail('actionAt', 'Action date and time cannot be in the future.')
  }
  return { ok: true, value: when }
}

/** BR-06: the follow-up note follows the checkbox, in both directions. */
export function checkFollowUp(
  required: unknown,
  note: unknown,
): Checked<{ followUpRequired: boolean; followUpNote: string | null }> {
  if (required !== undefined && typeof required !== 'boolean') {
    return fail('followUpRequired', 'Follow-up required must be true or false.')
  }
  const followUpRequired = required === true
  const cleaned = text(note, 'followUpNote', 'Follow-up note', FOLLOW_UP_NOTE_MAX, false)
  if (!cleaned.ok) return cleaned
  if (followUpRequired && cleaned.value === null) {
    return fail('followUpNote', 'A follow-up note is required when follow-up is needed.')
  }
  if (!followUpRequired && cleaned.value !== null) {
    return fail('followUpNote', 'Remove the follow-up note, or tick "Follow-up required".')
  }
  return { ok: true, value: { followUpRequired, followUpNote: followUpRequired ? cleaned.value : null } }
}

/** BR-16: the client's retry key. Returned as a clean string, or an error. */
export function checkRequestKey(raw: unknown): Checked<string> {
  if (typeof raw !== 'string') return fail('requestKey', 'requestKey is required.')
  const value = raw.trim()
  if (charCount(value) < 1 || charCount(value) > REQUEST_KEY_MAX) {
    return fail('requestKey', `requestKey must be 1 to ${REQUEST_KEY_MAX} characters.`)
  }
  return { ok: true, value }
}

/** The `version` a client saw (BR-15): a whole number of at least 1. */
export function checkVersion(raw: unknown): Checked<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return fail('version', 'version must be a whole number of at least 1.')
  }
  return { ok: true, value: raw }
}

/**
 * Input *shape*: the body must be a plain object that only uses the allowed
 * field names. Anything else (status, version on a create, id, …) is rejected
 * rather than silently ignored.
 */
export function checkShape(body: unknown, allowed: readonly string[]): Checked<Record<string, unknown>> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return fail('body', 'The request body must be a JSON object.')
  }
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) return fail(unknown[0], `${unknown[0]} is not a field you can send.`)
  return { ok: true, value: body as Record<string, unknown> }
}
