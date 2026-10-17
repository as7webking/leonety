import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { dashboardFinancialColumns, dashboardLegacyFinancialColumns, dashboardTimeEntryColumns, isMissingDashboardSnapshotColumns, productListColumns } from './performance-query-projections.ts'

test('product list requests only fields used by its cards, filters and actions', () => {
  const columns = productListColumns.split(', ')
  for (const field of ['id', 'name', 'category_id', 'sku', 'barcode', 'description', 'selling_price', 'currency', 'current_stock', 'low_stock_threshold', 'status', 'image_url', 'updated_at']) {
    assert.ok(columns.includes(field), `missing product list field ${field}`)
  }
  assert.equal(columns.includes('*'), false)
  assert.equal(columns.includes('woo_attributes'), false)
  assert.equal(columns.includes('woo_variants'), false)
})

test('product listing images decode asynchronously and load lazily', () => {
  const source = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')
  assert.equal((source.match(/<img src=\{product\.image_url\}[^>]*loading="lazy" decoding="async"/g) ?? []).length, 2)
})

test('dashboard projections retain saved currency snapshots and tolerate the legacy schema', () => {
  assert.match(dashboardFinancialColumns, /workspace_amount/)
  assert.match(dashboardFinancialColumns, /workspace_currency/)
  assert.match(dashboardLegacyFinancialColumns, /company_id/)
  assert.doesNotMatch(dashboardLegacyFinancialColumns, /workspace_amount|workspace_currency/)
  assert.equal(isMissingDashboardSnapshotColumns({ code: '42703' }), true)
  assert.equal(isMissingDashboardSnapshotColumns({ code: 'PGRST204' }), true)
  assert.equal(isMissingDashboardSnapshotColumns({ code: 'XX000' }), false)
  assert.equal(dashboardTimeEntryColumns, 'id, description, hours, date, company_id')
  const source = readFileSync(new URL('../app/(app)/dashboard/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /select\(dashboardFinancialColumns\)/)
  assert.match(source, /select\(dashboardLegacyFinancialColumns\)/)
  assert.match(source, /select\(dashboardTimeEntryColumns\)/)
})
