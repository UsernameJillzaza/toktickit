import { describe, it, expect } from 'vitest'
import {
  checkActionAt,
  checkAttachmentNotes,
  checkDescription,
  checkDraftResult,
  checkFollowUp,
  checkRequestKey,
  checkResult,
  checkShape,
  checkVersion,
  FUTURE_TOLERANCE_MS,
} from '../../src/actions/validation'

const err = (r: { ok: boolean; error?: { field: string } }) => (r.ok ? null : r.error!.field)

// UNIT-01 (AC-03, BR-04 … BR-09) — written alongside validation.ts, not
// before it: these are plain input/output rules.
describe('UNIT-01 Action field rules', () => {
  it('BR-04: description is required, trimmed, at most 2000 characters', () => {
    expect(checkDescription('  Replaced the cable  ')).toEqual({ ok: true, value: 'Replaced the cable' })
    expect(err(checkDescription(''))).toBe('description')
    expect(err(checkDescription('   '))).toBe('description')
    expect(err(checkDescription(undefined))).toBe('description')
    expect(err(checkDescription(42))).toBe('description')
    expect(checkDescription('x'.repeat(2000)).ok).toBe(true)
    expect(err(checkDescription('x'.repeat(2001)))).toBe('description')
  })

  it('BR-04: limits count characters, so an emoji is one, not two', () => {
    expect(checkDescription('😀'.repeat(2000)).ok).toBe(true) // 4000 UTF-16 units
    expect(err(checkDescription('😀'.repeat(2001)))).toBe('description')
    expect(checkFollowUp(true, '😀'.repeat(1000)).ok).toBe(true)
    expect(err(checkFollowUp(true, '😀'.repeat(1001)))).toBe('followUpNote')
    expect(checkAttachmentNotes('😀'.repeat(500)).ok).toBe(true)
    expect(err(checkAttachmentNotes('😀'.repeat(501)))).toBe('attachmentNotes')
    expect(checkResult('😀'.repeat(2000)).ok).toBe(true)
    expect(checkRequestKey('😀'.repeat(64)).ok).toBe(true)
    // Thai (all in the Basic Multilingual Plane) was never affected
    expect(checkDescription('ก'.repeat(2000)).ok).toBe(true)
  })

  it('BR-09: a result (or cancel reason) is required and limited to 2000; a draft result may be empty', () => {
    expect(checkResult(' fixed ')).toEqual({ ok: true, value: 'fixed' })
    expect(err(checkResult(''))).toBe('result')
    expect(err(checkResult(undefined))).toBe('result')
    expect(err(checkResult('x'.repeat(2001)))).toBe('result')
    expect(checkDraftResult('')).toEqual({ ok: true, value: null })
    expect(checkDraftResult(undefined)).toEqual({ ok: true, value: null })
    expect(err(checkDraftResult('x'.repeat(2001)))).toBe('result')
  })

  it('BR-07: attachment notes are optional and limited to 500', () => {
    expect(checkAttachmentNotes(undefined)).toEqual({ ok: true, value: null })
    expect(checkAttachmentNotes('  ')).toEqual({ ok: true, value: null })
    expect(checkAttachmentNotes('Photo in folder 401')).toEqual({ ok: true, value: 'Photo in folder 401' })
    expect(checkAttachmentNotes('x'.repeat(500)).ok).toBe(true)
    expect(err(checkAttachmentNotes('x'.repeat(501)))).toBe('attachmentNotes')
  })

  it('BR-06: the follow-up note is required exactly when follow-up is required', () => {
    expect(checkFollowUp(undefined, undefined)).toEqual({ ok: true, value: { followUpRequired: false, followUpNote: null } })
    expect(checkFollowUp(false, '')).toEqual({ ok: true, value: { followUpRequired: false, followUpNote: null } })
    expect(checkFollowUp(true, ' check Monday ')).toEqual({ ok: true, value: { followUpRequired: true, followUpNote: 'check Monday' } })
    expect(err(checkFollowUp(true, undefined))).toBe('followUpNote')
    expect(err(checkFollowUp(true, '   '))).toBe('followUpNote')
    expect(err(checkFollowUp(false, 'a note without follow-up'))).toBe('followUpNote')
    expect(err(checkFollowUp(undefined, 'a note without follow-up'))).toBe('followUpNote')
    expect(err(checkFollowUp(true, 'x'.repeat(1001)))).toBe('followUpNote')
    expect(checkFollowUp(true, 'x'.repeat(1000)).ok).toBe(true)
    expect(err(checkFollowUp('yes', 'n'))).toBe('followUpRequired')
  })

  it('BR-05: actionAt must be a real date no more than five minutes ahead', () => {
    const now = new Date('2026-11-01T10:00:00.000Z')
    expect(checkActionAt('2026-11-01T09:00:00.000Z', now).ok).toBe(true)
    expect(checkActionAt('2020-01-01T00:00:00.000Z', now).ok).toBe(true) // the past is fine
    expect(checkActionAt(new Date(now.getTime() + FUTURE_TOLERANCE_MS).toISOString(), now).ok).toBe(true)
    expect(err(checkActionAt(new Date(now.getTime() + FUTURE_TOLERANCE_MS + 1000).toISOString(), now))).toBe('actionAt')
    expect(err(checkActionAt('not a date', now))).toBe('actionAt')
    expect(err(checkActionAt('', now))).toBe('actionAt')
    expect(err(checkActionAt(12345, now))).toBe('actionAt')
  })

  it('BR-16: requestKey is 1 to 64 characters', () => {
    expect(checkRequestKey(' abc ')).toEqual({ ok: true, value: 'abc' })
    expect(err(checkRequestKey(''))).toBe('requestKey')
    expect(err(checkRequestKey(undefined))).toBe('requestKey')
    expect(err(checkRequestKey(7))).toBe('requestKey')
    expect(checkRequestKey('k'.repeat(64)).ok).toBe(true)
    expect(err(checkRequestKey('k'.repeat(65)))).toBe('requestKey')
  })

  it('BR-15: version is a whole number of at least 1', () => {
    expect(checkVersion(1)).toEqual({ ok: true, value: 1 })
    for (const bad of [0, -1, 1.5, '2', null, undefined]) expect(err(checkVersion(bad))).toBe('version')
  })

  it('shape: only a plain object with known field names is accepted', () => {
    expect(checkShape({ description: 'x' }, ['description']).ok).toBe(true)
    expect(err(checkShape({ description: 'x', status: 'COMPLETED' }, ['description']))).toBe('status')
    expect(err(checkShape([], ['description']))).toBe('body')
    expect(err(checkShape(null, ['description']))).toBe('body')
    expect(err(checkShape('text', ['description']))).toBe('body')
  })
})
