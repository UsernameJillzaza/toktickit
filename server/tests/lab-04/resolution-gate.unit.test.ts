import { describe, it, expect } from 'vitest'
import { gateReasons, resolutionHint } from '../../src/tickets/resolution'
import { ALL_STATUSES } from '../../src/tickets/workflow'

const counts = (open: number, completed: number, cancelled = 0) => ({ open, completed, cancelled })

// UNIT-02 (BR-19, BR-20, AC-17 … AC-19): the gate decision from the numbers of
// Open and Completed Actions, with no database involved.
describe('UNIT-02 resolution gate', () => {
  describe('moving to RESOLVED needs at least one Completed and no Open Action (BR-19)', () => {
    it.each([
      ['nothing at all', counts(0, 0), ['NO_COMPLETED_ACTION']],
      ['only cancelled actions', counts(0, 0, 3), ['NO_COMPLETED_ACTION']],
      ['an open action and no completed one: both problems, in this order', counts(1, 0), ['NO_COMPLETED_ACTION', 'OPEN_ACTIONS']],
      ['one completed, none open', counts(0, 1), []],
      ['several completed, none open, and a cancelled one', counts(0, 4, 2), []],
      ['one completed but another still open', counts(1, 1), ['OPEN_ACTIONS']],
      ['many open and many completed', counts(5, 5), ['OPEN_ACTIONS']],
    ])('%s', (_label, c, reasons) => {
      expect(gateReasons('RESOLVED', c)).toEqual(reasons)
    })
  })

  describe('moving to CANCELLED needs no Open Action (BR-20)', () => {
    it.each([
      ['no actions', counts(0, 0), []],
      ['only completed ones', counts(0, 3), []],
      ['an open action', counts(1, 0), ['OPEN_ACTIONS']],
      ['an open and a completed action', counts(2, 2), ['OPEN_ACTIONS']],
    ])('%s', (_label, c, reasons) => {
      expect(gateReasons('CANCELLED', c)).toEqual(reasons)
    })
  })

  it('no other target status is gated, whatever the counts', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== 'RESOLVED' && s !== 'CANCELLED')) {
      expect(gateReasons(status, counts(9, 0)), status).toEqual([])
    }
  })

  it('the hint for the screen says exactly what the gate would say', () => {
    for (const c of [counts(0, 0), counts(1, 0), counts(0, 1), counts(1, 1), counts(0, 2, 1)]) {
      const hint = resolutionHint(c)
      expect(hint.reasons).toEqual(gateReasons('RESOLVED', c))
      expect(hint.canResolve).toBe(gateReasons('RESOLVED', c).length === 0)
      expect(hint.canCancel).toBe(gateReasons('CANCELLED', c).length === 0)
    }
    expect(resolutionHint(counts(0, 1))).toEqual({ canResolve: true, canCancel: true, reasons: [] })
    expect(resolutionHint(counts(1, 1))).toEqual({ canResolve: false, canCancel: false, reasons: ['OPEN_ACTIONS'] })
  })
})
