import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildOfflineDraftKey, sanitizeOfflineDraftPayload } from './offline-drafts.ts'

test('draft keys isolate user, workspace and form kind', () => {
  const first = buildOfflineDraftKey('user-a', 'workspace-a', 'income')
  assert.notEqual(first, buildOfflineDraftKey('user-b', 'workspace-a', 'income'))
  assert.notEqual(first, buildOfflineDraftKey('user-a', 'workspace-b', 'income'))
  assert.notEqual(first, buildOfflineDraftKey('user-a', 'workspace-a', 'expense'))
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
})
