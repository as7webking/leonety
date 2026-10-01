import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const providerSource = readFileSync(new URL('./address-providers.ts', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../app/api/address/search/route.ts', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('../components/address-autocomplete.tsx', import.meta.url), 'utf8')
const clientFormSource = readFileSync(new URL('../components/clients/client-form.tsx', import.meta.url), 'utf8')
const employeeFormSource = readFileSync(new URL('../components/employees/employee-profile-form.tsx', import.meta.url), 'utf8')
const workspaceFormSource = readFileSync(new URL('../components/settings/workspace-settings-panel.tsx', import.meta.url), 'utf8')
const locationFormSource = readFileSync(new URL('../app/(app)/locations/page.tsx', import.meta.url), 'utf8')

test('uses official Places API New endpoints with a server-only key and field masks', () => {
  assert.match(providerSource, /https:\/\/places\.googleapis\.com\/v1\/places:autocomplete/)
  assert.match(providerSource, /https:\/\/places\.googleapis\.com\/v1\/places\//)
  assert.match(providerSource, /process\.env\.GOOGLE_MAPS_API_KEY/)
  assert.doesNotMatch(providerSource, /NEXT_PUBLIC_[A-Z_]*GOOGLE_MAPS/)
  assert.match(providerSource, /X-Goog-FieldMask/)
  assert.match(providerSource, /sessionToken/)
})

test('keeps the address proxy authenticated and does not return provider diagnostics', () => {
  const authCheck = routeSource.indexOf('if (authError || !authData.user)')
  const providerCall = routeSource.indexOf('await searchAddresses')
  assert.ok(authCheck > -1)
  assert.ok(providerCall > authCheck)
  assert.doesNotMatch(routeSource, /error\.stack/)
})

test('reuses one accessible autocomplete in compatible address forms', () => {
  for (const source of [clientFormSource, employeeFormSource, workspaceFormSource, locationFormSource]) {
    assert.match(source, /<AddressAutocomplete/)
  }
  assert.match(componentSource, /role="combobox"/)
  assert.match(componentSource, /role="listbox"/)
  assert.match(componentSource, /Google Maps/)
  assert.match(componentSource, /manualFallback/)
})
