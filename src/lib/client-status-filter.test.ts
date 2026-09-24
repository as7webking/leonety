import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getFilteredClientTotal, normalizeClientStatusFilter, planClientPage } from './client-status-filter.ts'

test('normalizes one shared client status filter', () => {
  assert.equal(normalizeClientStatusFilter('active'), 'active')
  assert.equal(normalizeClientStatusFilter('inactive'), 'inactive')
  assert.equal(normalizeClientStatusFilter('archived'), 'all')
  assert.equal(normalizeClientStatusFilter(null), 'all')
})

test('all pages active clients before inactive clients', () => {
  assert.deepEqual(planClientPage({ filter: 'all', activeCount: 25, inactiveCount: 8, page: 0, pageSize: 20 }), [
    { group: 'active', from: 0, to: 19 },
  ])
  assert.deepEqual(planClientPage({ filter: 'all', activeCount: 25, inactiveCount: 8, page: 1, pageSize: 20 }), [
    { group: 'active', from: 20, to: 24 },
    { group: 'inactive', from: 0, to: 7 },
  ])
})

test('active and inactive filters paginate only their own group', () => {
  assert.deepEqual(planClientPage({ filter: 'active', activeCount: 30, inactiveCount: 7, page: 1, pageSize: 20 }), [
    { group: 'active', from: 20, to: 29 },
  ])
  assert.deepEqual(planClientPage({ filter: 'inactive', activeCount: 30, inactiveCount: 7, page: 0, pageSize: 20 }), [
    { group: 'inactive', from: 0, to: 6 },
  ])
  assert.equal(getFilteredClientTotal('all', 30, 7), 37)
})
