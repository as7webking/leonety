import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { toWorkspaceLegalUpdate, workspaceLegalColumns } from './workspace-legal-settings.ts'

const apiSource = readFileSync(new URL('../app/api/workspaces/legal/route.ts', import.meta.url), 'utf8')
const fieldsSource = readFileSync(new URL('./workspace-legal-settings.ts', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../app/(app)/settings/legal/page.tsx', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('../components/settings/workspace-legal-settings.tsx', import.meta.url), 'utf8')
const settingsPageSource = readFileSync(new URL('../app/(app)/settings/page.tsx', import.meta.url), 'utf8')
const dictionarySource = readFileSync(new URL('./legal-settings-i18n.ts', import.meta.url), 'utf8')

test('workspace legal API requires authenticated workspace ownership for reads and writes', () => {
  assert.match(apiSource, /requireOwnedCompany\(parsed\.data(?:\.companyId)?\)/)
  assert.match(apiSource, /\.eq\('id', parsed\.data\.companyId\)/)
  assert.match(apiSource, /\.eq\('owner_id', auth\.user\.id\)/)
  assert.doesNotMatch(apiSource, /NEXT_PUBLIC_|auth\.users|DROP|TRUNCATE/i)
})

test('workspace legal settings save round-trips seller and bank fields without merging tax identifiers', () => {
  const saved = toWorkspaceLegalUpdate({
    legal_form: 'GmbH',
    tax_number: '12/345/67890',
    vat_id: 'DE123456789',
    account_holder: 'Example GmbH',
    bank_name: 'Example Bank',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    payment_terms: 'Pay within 14 days',
  })

  assert.deepEqual(saved, Object.fromEntries(workspaceLegalColumns.map((column) => [
    column,
    ({ legal_form: 'GmbH', tax_number: '12/345/67890', vat_id: 'DE123456789', account_holder: 'Example GmbH', bank_name: 'Example Bank', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', payment_terms: 'Pay within 14 days' } as Record<string, string>)[column] ?? null,
  ])))
  assert.equal(saved.tax_number, '12/345/67890')
  assert.equal(saved.vat_id, 'DE123456789')
  assert.match(apiSource, /\.update\(\{ \.\.\.toWorkspaceLegalUpdate\(parsed\.data\)/)
  assert.match(apiSource, /\.select\(workspaceLegalColumns\.join\(','\)\)/)
})

test('empty optional workspace settings are saved as null and never fabricated', () => {
  const saved = toWorkspaceLegalUpdate({ tax_number: '', vat_id: '  ', iban: null, account_holder: '  ' })
  assert.equal(saved.tax_number, null)
  assert.equal(saved.vat_id, null)
  assert.equal(saved.iban, null)
  assert.equal(saved.account_holder, null)
  assert.equal(saved.bank_name, null)
})

test('workspace settings reads and writes are constrained to the authenticated owner workspace', () => {
  assert.match(apiSource, /const auth = await requireOwnedCompany\(parsed\.data\)/)
  assert.match(apiSource, /\.eq\('id', parsed\.data\)/)
  assert.match(apiSource, /\.eq\('id', parsed\.data\.companyId\)/)
  assert.equal((apiSource.match(/\.eq\('owner_id', auth\.user\.id\)/g) ?? []).length, 2)
})

test('legal settings use the approved company columns without touching public operator legal content', () => {
  for (const field of [
    'legal_name', 'legal_form', 'legal_representative', 'legal_street', 'legal_house_number',
    'legal_postal_code', 'legal_city', 'legal_country_code', 'legal_email', 'legal_phone',
    'vat_id', 'tax_number', 'account_holder', 'bank_name', 'iban', 'bic', 'payment_terms',
    'commercial_register', 'register_court', 'registration_number',
    'professional_regulatory_info', 'additional_legal_text',
  ]) {
    assert.match(`${apiSource}\n${fieldsSource}`, new RegExp(`['\"]${field}['\"]`))
  }
  assert.doesNotMatch(componentSource, /publicWebsite|legal-config|operator/i)
})

test('preview is based on persisted response state and suppresses empty optional content', () => {
  assert.match(componentSource, /setSaved\(next\)/)
  assert.match(componentSource, /Object\.values\(saved\)\.some/)
  assert.match(componentSource, /!previewHasContent/)
  assert.match(componentSource, /filter\(\(\[, value\]\) => value\)/)
})

test('workspace changes clear previous legal data before loading the next workspace', () => {
  assert.match(componentSource, /const controller = new AbortController\(\)[\s\S]*setForm\(emptyLegalSettings\)[\s\S]*setSaved\(emptyLegalSettings\)[\s\S]*setPreviewOpen\(false\)[\s\S]*setLoading\(true\)/)
  assert.match(componentSource, /return \(\) => controller\.abort\(\)/)
})

test('legal settings are linked from authenticated settings and translated for all locales', () => {
  assert.match(settingsPageSource, /href="\/app\/settings\/legal"/)
  assert.match(pageSource, /WorkspaceLegalSettings/)
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr']) {
    assert.match(dictionarySource, new RegExp(`const ${locale}(?:: typeof en)? =`))
  }
})
