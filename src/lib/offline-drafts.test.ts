import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildOfflineDraftKey, buildOfflineInvoiceDraftKey, sanitizeOfflineDraftPayload, sanitizeOfflineInvoiceDraftPayload } from './offline-drafts.ts'

test('draft keys isolate user, workspace and form kind', () => {
  const first = buildOfflineDraftKey('user-a', 'workspace-a', 'income')
  assert.notEqual(first, buildOfflineDraftKey('user-b', 'workspace-a', 'income'))
  assert.notEqual(first, buildOfflineDraftKey('user-a', 'workspace-b', 'income'))
  assert.notEqual(first, buildOfflineDraftKey('user-a', 'workspace-a', 'expense'))
})

test('invoice draft identities isolate user, workspace and multiple local invoices', () => {
  const first = buildOfflineInvoiceDraftKey('user-a', 'workspace-a', 'local-a')
  assert.notEqual(first, buildOfflineInvoiceDraftKey('user-b', 'workspace-a', 'local-a'))
  assert.notEqual(first, buildOfflineInvoiceDraftKey('user-a', 'workspace-b', 'local-a'))
  assert.notEqual(first, buildOfflineInvoiceDraftKey('user-a', 'workspace-a', 'local-b'))
})

test('invoice local payload allowlists drafting fields and excludes finalization/payment data', () => {
  const invoice = sanitizeOfflineInvoiceDraftPayload({
    clientId: 'client-1',
    clientName: 'Selected client',
    quickClient: { id: 'local-client-1', name: 'Manual client', phone: '123', interestedIn: 'service', taxId: 'excluded' },
    items: [{ description: 'Consulting', quantity: 2, unit_price: 30, tax_rate: 19, line_total: 71.4, invoice_id: 'excluded' }],
    issueDate: '2026-10-11',
    dueDate: '',
    currency: 'EUR',
    taxCountry: 'DE',
    taxType: 'standard',
    notes: 'Draft note',
    invoice_number: 'MUST-NOT-BE-STORED',
    status: 'paid',
    payments: [{ amount: 60 }],
    access_token: 'secret',
    company_id: 'attacker-workspace',
  })
  assert.equal(invoice.clientId, 'client-1')
  assert.equal(invoice.items[0].description, 'Consulting')
  assert.equal('line_total' in invoice.items[0], false)
  assert.equal('invoice_number' in invoice, false)
  assert.equal('status' in invoice, false)
  assert.equal('payments' in invoice, false)
  assert.equal('access_token' in invoice, false)
  assert.equal('company_id' in invoice, false)
  assert.equal('taxId' in invoice.quickClient, false)
})

test('income and expense drafts retain only allowlisted form fields', () => {
  const income = sanitizeOfflineDraftPayload('income', {
    amount: '100',
    title: 'Project',
    note: 'Review',
    access_token: 'must-not-survive',
    company_id: 'must-come-from-current-context',
  })
  assert.equal(income.title, 'Project')
  assert.equal(income.note, 'Review')
  assert.equal('access_token' in income, false)
  assert.equal('company_id' in income, false)

  const expense = sanitizeOfflineDraftPayload('expense', {
    amount: '25',
    title: 'Office',
    password: 'must-not-survive',
  })
  assert.equal(expense.title, 'Office')
  assert.equal('password' in expense, false)
})

test('contract drafts exclude tax identifiers and force local draft status', () => {
  const contract = sanitizeOfflineDraftPayload('contract', {
    title: 'Service agreement',
    status: 'finalized',
    partyA: { name: 'Company A', taxId: 'sensitive-a' },
    partyB: { name: 'Company B', taxId: 'sensitive-b' },
    document: { title: 'Agreement', clauses: [] },
    oauthToken: 'must-not-survive',
  })
  assert.equal(contract.status, 'draft')
  assert.equal('taxId' in (contract.partyA as Record<string, unknown>), false)
  assert.equal('taxId' in (contract.partyB as Record<string, unknown>), false)
  assert.equal('oauthToken' in contract, false)
})

test('offline drafts use IndexedDB and do not create a mutation queue', () => {
  const source = readFileSync(new URL('./offline-drafts.ts', import.meta.url), 'utf8')
  assert.match(source, /indexedDB/)
  assert.doesNotMatch(source, /localStorage/)
  assert.doesNotMatch(source, /supabase|fetch\(/i)
  assert.doesNotMatch(source, /mutation.?queue/i)
  assert.match(source, /invoiceDrafts/)
  assert.match(source, /sanitizeOfflineInvoiceDraftPayload/)
})
