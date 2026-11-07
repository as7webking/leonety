import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { createClientPartySnapshot, createCompanyPartySnapshot, emptyPartySnapshot, getContractPartyLines, normalizeContractPartySnapshot, refreshClientPartySnapshot, refreshCompanyPartySnapshot } from './contracts.ts'

const labels = Object.fromEntries([
  'name', 'company', 'legalForm', 'representative', 'street', 'houseNumber', 'postalCode',
  'city', 'region', 'address', 'country', 'email', 'phone', 'taxNumber', 'vatId',
  'commercialRegister', 'registerCourt', 'registrationNumber', 'professionalRegulatoryInfo',
  'additionalLegalText', 'legacyTaxId',
].map((key) => [key, key])) as unknown as Parameters<typeof getContractPartyLines>[1]

test('company party snapshot uses only the existing legal profile fields and keeps VAT separate', () => {
  const party = createCompanyPartySnapshot({
    legal_name: 'Example GmbH', legal_representative: 'Ada Example', legal_street: 'Long Street',
    legal_house_number: '12A', legal_postal_code: '10115', legal_city: 'Berlin',
    legal_country_code: 'DE', legal_email: 'legal@example.test', legal_phone: '+49 30 123',
    vat_id: 'DE123456789', commercial_register: 'HRB', register_court: 'Berlin', registration_number: '12345',
    professional_regulatory_info: 'Licensed profession', additional_legal_text: 'Legal footer details',
  })
  assert.equal(party.company, 'Example GmbH')
  assert.equal(party.representative, 'Ada Example')
  assert.equal(party.taxNumber, '')
  assert.equal(party.vatId, 'DE123456789')
  assert.equal(party.registrationNumber, '12345')
  assert.equal(party.professionalRegulatoryInfo, 'Licensed profession')
  assert.equal(party.additionalLegalText, 'Legal footer details')
})

test('client tax_number remains a tax number and does not become a VAT ID', () => {
  const party = createClientPartySnapshot({
    name: 'Morgan Example', company: 'Client Ltd', street: 'Main Road', houseNumber: '7',
    postalCode: '10001', city: 'New York', country: 'US', taxNumber: 'TAX-42',
  })
  assert.equal(party.name, 'Morgan Example')
  assert.equal(party.company, 'Client Ltd')
  assert.equal(party.taxNumber, 'TAX-42')
  assert.equal(party.vatId, '')
})

test('profile refresh updates sourced draft fields but preserves contract-only legal details', () => {
  const current = { ...emptyPartySnapshot, company: 'Old name', vatId: 'MANUAL-VAT', legalForm: 'AG', region: 'North' }
  const next = refreshCompanyPartySnapshot(current, createCompanyPartySnapshot({ legal_name: 'New name' }))
  assert.equal(next.company, 'New name')
  assert.equal(next.vatId, '')
  assert.equal(next.legalForm, 'AG')
  assert.equal(next.region, 'North')

  const client = refreshClientPartySnapshot(
    { ...emptyPartySnapshot, vatId: 'CLIENT-VAT', registrationNumber: 'MANUAL-REG' },
    createClientPartySnapshot({ name: 'Buyer', taxNumber: 'T-1' }),
  )
  assert.equal(client.name, 'Buyer')
  assert.equal(client.taxNumber, 'T-1')
  assert.equal(client.vatId, 'CLIENT-VAT')
  assert.equal(client.registrationNumber, 'MANUAL-REG')
})

test('legacy snapshots normalize without inventing missing fields or relabeling legacy tax IDs', () => {
  const party = normalizeContractPartySnapshot({ company: 'Old Company', taxId: 'OLD-1' })
  assert.equal(party.company, 'Old Company')
  assert.equal(party.taxId, 'OLD-1')
  assert.equal(party.taxNumber, '')
  assert.equal(party.vatId, '')
  assert.equal(normalizeContractPartySnapshot(null).company, emptyPartySnapshot.company)
})

test('party rendering omits empty labels and preserves long multiline legal details', () => {
  const longName = 'A'.repeat(260)
  const multiline = 'Building 1\nCare of Legal Department'
  const lines = getContractPartyLines({
    ...emptyPartySnapshot,
    company: longName,
    address: multiline,
    taxNumber: 'Steuernummer 12/345/67890',
    vatId: 'DE123456789',
  }, labels)
  assert.deepEqual(lines.map((line) => line.label), ['company', 'address', 'taxNumber', 'vatId'])
  assert.equal(lines[0].value, longName)
  assert.equal(lines[1].value, multiline)
})

test('contract form, preview and print share snapshots and keep finalized records read-only', () => {
  const page = readFileSync(new URL('../app/(app)/contracts/page.tsx', import.meta.url), 'utf8')
  const legalApi = readFileSync(new URL('../app/api/workspaces/legal/route.ts', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(page, /\.from\('clients'\)[\s\S]*?\.eq\('company_id', currentCompany\.id\)/)
  assert.match(legalApi, /requireOwnedCompany\(parsed\.data\)/)
  assert.match(page, /<ContractDocumentContent[\s\S]*?partyA=\{partyA\}[\s\S]*?partyB=\{partyB\}[\s\S]*?terms=\{terms\}/)
  assert.match(page, /<PrintableContract[\s\S]*?partyA=\{displayedPartyA\}[\s\S]*?partyB=\{displayedPartyB\}[\s\S]*?terms=\{displayedContract\?\.terms_snapshot \?\? terms\}/)
  assert.match(page, /className="print-area"/)
  assert.match(css, /@page\s*\{[\s\S]*?size:\s*A4 portrait/)
  assert.match(page, /grid-cols-1 gap-6 text-sm sm:grid-cols-2/)
  assert.match(page, /contract\.status === 'finalized'[\s\S]*?createNewVersion\(contract\)/)
  assert.match(page, /contract\.status === 'finalized'\) \{[\s\S]*?setError\(t\('contracts\.finalizedReadOnly'\)\)/)
})

test('AI contract prompt receives terms only and cannot synthesize party identifiers', () => {
  const ai = readFileSync(new URL('./contract-ai.ts', import.meta.url), 'utf8')
  assert.match(ai, /Party identity and legal particulars are rendered separately/)
  assert.match(ai, /Do not merge a tax number with a VAT ID/)
  assert.doesNotMatch(ai, /partyA:\s*input\.partyA|partyB:\s*input\.partyB/)
})
