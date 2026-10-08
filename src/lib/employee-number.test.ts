import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { createDefaultEmployeeNumberSettings, formatEmployeeNumberPreview, isEmployeeNumberSchemaUnavailable } from './employee-number.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { employeeNumberDictionaries } from './employee-number-i18n.ts'

test('formats a prefix and zero-padded next number for the settings preview only', () => {
  assert.equal(formatEmployeeNumberPreview('EMP-', 1, 4), 'EMP-0001')
  assert.equal(formatEmployeeNumberPreview(' EMP-', 82, 3), 'EMP-082')
})

test('defaults workspace settings to optional manual numbering', () => {
  assert.deepEqual(createDefaultEmployeeNumberSettings('workspace-1'), {
    company_id: 'workspace-1',
    require_employee_number: false,
    automatic_numbering: false,
    number_prefix: '',
    next_number: 1,
    minimum_digits: 1,
  })
})

test('recognizes only missing optional-schema errors for compatibility fallback', () => {
  assert.equal(isEmployeeNumberSchemaUnavailable({ code: '42703' }), true)
  assert.equal(isEmployeeNumberSchemaUnavailable({ code: 'PGRST205' }), true)
  assert.equal(isEmployeeNumberSchemaUnavailable({ code: '42501' }), false)
})

test('provides complete employee-number UI copy in every supported locale', () => {
  const locales = ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const
  const expectedKeys = Object.keys(employeeNumberDictionaries.en).sort()
  for (const locale of locales) {
    assert.deepEqual(Object.keys(employeeNumberDictionaries[locale]).sort(), expectedKeys)
    assert.ok(employeeNumberDictionaries[locale]['employeeNumber.label'])
  }
})
