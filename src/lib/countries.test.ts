import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { formatCountryValue, getCountryName, resolveCountryCode } from './countries.ts'

test('resolves ISO codes and localized legacy country names', () => {
  assert.equal(resolveCountryCode('de'), 'DE')
  assert.equal(resolveCountryCode('Germany'), 'DE')
  assert.equal(resolveCountryCode('Deutschland'), 'DE')
  assert.equal(resolveCountryCode('Франция'), 'FR')
})

test('formats canonical country codes in the current Leonety locale', () => {
  assert.equal(formatCountryValue('DE', 'en'), getCountryName('DE', 'en'))
  assert.equal(formatCountryValue('DE', 'de'), getCountryName('DE', 'de'))
  assert.equal(formatCountryValue('DE', 'uk'), getCountryName('DE', 'uk'))
})

test('preserves unknown legacy and custom country values', () => {
  assert.equal(resolveCountryCode('Legacy custom territory'), null)
  assert.equal(formatCountryValue('Legacy custom territory', 'en'), 'Legacy custom territory')
})
