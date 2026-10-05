import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const apiSource = readFileSync(new URL('../app/api/workspaces/legal/route.ts', import.meta.url), 'utf8')
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

test('legal settings use the approved company columns without touching public operator legal content', () => {
  for (const field of [
    'legal_name', 'legal_representative', 'legal_street', 'legal_house_number',
    'legal_postal_code', 'legal_city', 'legal_country_code', 'legal_email',
    'legal_phone', 'vat_id', 'commercial_register', 'register_court',
    'registration_number', 'professional_regulatory_info', 'additional_legal_text',
  ]) {
    assert.match(apiSource, new RegExp(`['\"]${field}['\"]`))
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
