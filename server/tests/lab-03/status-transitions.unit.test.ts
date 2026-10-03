import { describe, it, expect } from 'vitest'
import { canTransition, allowedTransitions, OWNER_REQUIRED_STATUSES, isTerminal } from '../../src/tickets/workflow'

// Spec Section 5.2, transcribed here independently of src/tickets/workflow.ts
// so a typo in either copy shows up as a failing cell.
// Rows = from, columns = to. 'x' = allowed.
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'] as const
type Status = (typeof STATUSES)[number]

//                          NEW  OPEN  IN_P  WAIT  RES   CLO   REOP  CANC
const MATRIX: Record<Status, string[]> = {
  NEW:                   ['-', 'x',  'x',  '-',  '-',  '-',  '-',  'x'],
  OPEN:                  ['-', '-',  'x',  'x',  'x',  '-',  '-',  'x'],
  IN_PROGRESS:           ['-', '-',  '-',  'x',  'x',  '-',  '-',  'x'],
  WAITING_FOR_REQUESTER: ['-', '-',  'x',  '-',  'x',  '-',  '-',  'x'],
  RESOLVED:              ['-', '-',  '-',  '-',  '-',  'x',  'x',  '-'],
  CLOSED:                ['-', '-',  '-',  '-',  '-',  '-',  '-',  '-'],
  REOPENED:              ['-', '-',  'x',  'x',  'x',  '-',  '-',  'x'],
  CANCELLED:             ['-', '-',  '-',  '-',  '-',  '-',  '-',  '-'],
}

const CELLS = STATUSES.flatMap((from) =>
  STATUSES.map((to, i) => [from, to, MATRIX[from][i] === 'x'] as const),
)

// UNIT-03 (BR-22, 5.2): all 64 cells, including "same status" on the diagonal.
describe('UNIT-03 transition matrix', () => {
  it.each(CELLS)('%s → %s allowed: %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected)
  })

  it('allowedTransitions lists exactly the allowed cells of a row, in matrix order', () => {
    expect(allowedTransitions('OPEN')).toEqual(['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'])
    expect(allowedTransitions('RESOLVED')).toEqual(['CLOSED', 'REOPENED'])
    expect(allowedTransitions('CLOSED')).toEqual([])
  })

  it('CLOSED and CANCELLED are terminal (BR-20)', () => {
    expect(STATUSES.filter(isTerminal)).toEqual(['CLOSED', 'CANCELLED'])
  })
})

// UNIT-04 (BR-23)
describe('UNIT-04 statuses that need an owner', () => {
  it('are exactly IN_PROGRESS, WAITING_FOR_REQUESTER and RESOLVED', () => {
    expect([...OWNER_REQUIRED_STATUSES].sort()).toEqual(['IN_PROGRESS', 'RESOLVED', 'WAITING_FOR_REQUESTER'])
  })
})
