import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { parseSavedTableViewCollection, parseSavedTableViewState, savedTableViewsStorageKey, serializeSavedTableViewCollection, type SavedTableViewCollection, type ExpenseTableViewState } from './saved-table-views.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { savedTableViewsI18n } from './saved-table-views-i18n.ts'

test('saved view keys are isolated by user, workspace, and table', () => {
  const a = savedTableViewsStorageKey('products', 'user-a', 'workspace-a')
  assert.notEqual(a, savedTableViewsStorageKey('products', 'user-b', 'workspace-a'))
  assert.notEqual(a, savedTableViewsStorageKey('products', 'user-a', 'workspace-b'))
  assert.notEqual(a, savedTableViewsStorageKey('expenses', 'user-a', 'workspace-a'))
})

test('each table accepts only its allowlisted state and safe bounded values', () => {
  assert.deepEqual(parseSavedTableViewState('invoices', { statusFilter: 'overdue', href: 'javascript:alert(1)' }), { statusFilter: 'overdue' })
  assert.equal(parseSavedTableViewState('invoices', { statusFilter: 'arbitrary' }), null)
  assert.equal(parseSavedTableViewState('products', { query: 'x'.repeat(201), statusFilter: 'all', categoryFilter: 'all', stockFilter: 'all', providerFilter: 'all', imageFilter: 'all', sortBy: 'name_asc' }), null)
  assert.equal(parseSavedTableViewState('expenses', { searchQuery: '', groupReportsByMonth: false, filterFromDate: '2026-99-99', filterToDate: '', sortBy: 'date', sortDirection: 'desc' }), null)
})

test('collection parser rejects invalid entries and default IDs outside the collection', () => {
  const result = parseSavedTableViewCollection<ExpenseTableViewState>('expenses', JSON.stringify({
    defaultViewId: 'missing',
    views: [
      { id: 'good', name: 'Rent', updatedAt: 1, state: { searchQuery: 'rent', groupReportsByMonth: false, filterFromDate: '', filterToDate: '', sortBy: 'date', sortDirection: 'desc' } },
      { id: 'bad', name: 'Unsafe', updatedAt: 2, state: { searchQuery: '', groupReportsByMonth: false, filterFromDate: '', filterToDate: '', sortBy: 'other', sortDirection: 'desc' } },
    ],
  }))
  assert.equal(result.views.length, 1)
  assert.equal(result.defaultViewId, null)
})

test('saved view collection round-trips without record data', () => {
  const collection: SavedTableViewCollection<ExpenseTableViewState> = {
    defaultViewId: 'view-1',
    views: [{ id: 'view-1', name: 'This month / Rent', updatedAt: 100, state: { searchQuery: 'rent', groupReportsByMonth: true, filterFromDate: '2026-11-01', filterToDate: '2026-11-30', sortBy: 'date', sortDirection: 'desc' } }],
  }
  assert.deepEqual(parseSavedTableViewCollection<ExpenseTableViewState>('expenses', serializeSavedTableViewCollection(collection)), collection)
})

test('saved view actions are translated for every supported locale', () => {
  const required = ['title', 'choose', 'saveCurrent', 'name', 'save', 'cancel', 'apply', 'rename', 'delete', 'setDefault', 'default', 'storageUnavailable', 'nameRequired'] as const
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    for (const key of required) assert.ok(savedTableViewsI18n[locale][key], `${locale}: ${key}`)
  }
})
