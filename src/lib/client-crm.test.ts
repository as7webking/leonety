import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { clientFormToWritePayload } from './client-write-payload.ts'

const formSource = readFileSync(new URL('../components/clients/client-form.tsx', import.meta.url), 'utf8')
const payloadSource = readFileSync(new URL('./client-write-payload.ts', import.meta.url), 'utf8')
const emptyForm = {
  clientType: 'person' as const,
  name: '', client_company: '', email: '', phone: '', street: '', house_number: '',
  postal_code: '', city: '', country: '', tax_number: '', vat_id: '',
  interested_in: '', notes: '', status: 'lead' as const,
}

test('client form persists tax number and VAT ID to their distinct canonical fields', () => {
  const form = { ...emptyForm, name: 'Buyer', tax_number: 'TAX-123', vat_id: 'DE123456789' }
  const payload = clientFormToWritePayload('workspace-a', form, '2026-11-11T10:00:00.000Z')

  assert.equal(payload.tax_number, 'TAX-123')
  assert.equal(payload.vat_id, 'DE123456789')
  assert.equal(payload.company_id, 'workspace-a')
  assert.match(formSource, /clientFormToWritePayload\(currentCompany\.id, form/)
  assert.match(formSource, /\.update\(value\)\.eq\('id', client\.id\)\.eq\('company_id', currentCompany\.id\)/)
})

test('blank client details remain blank in storage instead of being fabricated', () => {
  const payload = clientFormToWritePayload('workspace-a', { ...emptyForm, name: 'Buyer' }, '2026-11-11T10:00:00.000Z')
  for (const field of ['email', 'phone', 'tax_number', 'vat_id', 'street', 'house_number', 'postal_code', 'city', 'country']) {
    assert.equal(payload[field as keyof typeof payload], null, `${field} should remain empty`)
  }
  assert.equal(payload.name, 'Buyer')
})

test('client saves remain scoped to the selected workspace for inserts and updates', () => {
  assert.match(payloadSource, /company_id: companyId/)
  assert.match(formSource, /\.eq\('company_id', currentCompany\.id\)/)
  assert.match(formSource, /from\('clients'\)\.insert\(value\)/)
})
