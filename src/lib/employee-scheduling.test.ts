import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildShiftCandidates, classifyShiftCandidates, createDefaultWeeklySchedule, getWorkingMinutes } from './employee-scheduling.ts'

describe('employee scheduling', () => {
  it('uses independent weekday times and skips off days', () => {
    const schedule = createDefaultWeeklySchedule().map((day) => day.weekday === 2
      ? { ...day, startTime: '10:00', endTime: '18:00' }
      : day.weekday === 3 ? { ...day, isWorking: false } : day)
    const shifts = buildShiftCandidates('2026-10-05', '2026-10-11', schedule)
    assert.equal(shifts.length, 4)
    assert.equal(shifts.find((shift) => shift.weekday === 2)?.startTime, '10:00')
    assert.equal(shifts.some((shift) => shift.weekday === 3), false)
  })

  it('detects duplicates and overlaps without overwriting', () => {
    const candidates = buildShiftCandidates('2026-10-05', '2026-10-05', createDefaultWeeklySchedule())
    assert.equal(classifyShiftCandidates(candidates, [{ id: '1', date: '2026-10-05', startTime: '09:00', endTime: '17:00' }])[0].status, 'duplicate')
    assert.equal(classifyShiftCandidates(candidates, [{ id: '2', date: '2026-10-05', startTime: '12:00', endTime: '20:00' }])[0].status, 'overlap')
  })

  it('rejects overnight and invalid break ranges supported by neither schema nor UI', () => {
    assert.equal(getWorkingMinutes('22:00', '06:00', 30), null)
    assert.equal(getWorkingMinutes('09:00', '17:00', 480), null)
    assert.equal(getWorkingMinutes('09:00', '17:00', 30), 450)
  })
})
