import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { addDaysToDateOnly, enumerateDateOnlyRange, formatDateOnly, formatDateOnlyInput, parseDateOnly } from './date-only.ts'

test('date-only values format without changing the selected calendar day', () => {
  assert.equal(formatDateOnly('2026-09-13', 'de-DE'), '13.09.2026')
  assert.equal(formatDateOnly('2026-09-13', 'en-US'), 'Sep 13, 2026')
  assert.equal(formatDateOnly('2026-09-13', 'ru-RU'), '13 сент. 2026 г.')
})

test('date-only parsing rejects impossible and localized values', () => {
  assert.equal(parseDateOnly('2026-02-30'), null)
  assert.equal(parseDateOnly('13.09.2026'), null)
})

test('date-only arithmetic crosses month and year boundaries canonically', () => {
  assert.equal(addDaysToDateOnly('2026-12-31', 1), '2027-01-01')
  assert.deepEqual(enumerateDateOnlyRange('2026-09-11', '2026-09-15', [1, 2, 3, 4, 5]), [
    '2026-09-11',
    '2026-09-14',
    '2026-09-15',
  ])
})

test('native date input values use local calendar fields instead of UTC conversion', () => {
  assert.equal(formatDateOnlyInput(new Date(2026, 8, 13, 23, 30)), '2026-09-13')
})
