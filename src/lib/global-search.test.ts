import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { escapeGlobalSearchTerm, globalSearchHref, normalizeGlobalSearchQuery } from './global-search.ts'

const routeSource = readFileSync(new URL('../app/api/global-search/route.ts', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('../components/app-search.tsx', import.meta.url), 'utf8')

describe('global search helpers', () => {
  it('normalizes bounded queries and rejects too-short or control-character input', () => {
    assert.equal(normalizeGlobalSearchQuery('  Acme   GmbH  '), 'Acme GmbH')
    assert.equal(normalizeGlobalSearchQuery('x'), null)
    assert.equal(normalizeGlobalSearchQuery(`ab\ncd`), null)
    assert.equal(normalizeGlobalSearchQuery('x'.repeat(81)), null)
  })

  it('escapes LIKE metacharacters so user input is treated literally', () => {
    assert.equal(escapeGlobalSearchTerm("50%_\\"), "50\\%\\_\\\\")
  })

  it('uses only established entity detail destinations with encoded identifiers', () => {
    assert.equal(globalSearchHref('clients', 'id/with space'), '/app/clients/id%2Fwith%20space')
    assert.equal(globalSearchHref('invoices', 'abc&next=/admin'), '/app/invoices?invoiceId=abc%26next%3D%2Fadmin')
    assert.equal(globalSearchHref('products', 'p1'), '/app/products/p1')
    assert.equal(globalSearchHref('employees', 'e1'), '/app/employees/e1')
    assert.equal(globalSearchHref('contracts', 'c1'), '/app/contracts?contractId=c1')
  })

  it('keeps server queries workspace-scoped, bounded and limited to display-safe fields', () => {
    assert.match(routeSource, /requireOwnedCompany\(companyId\)/)
    assert.equal((routeSource.match(/\.eq\('company_id', companyId\)/g) ?? []).length, 8)
    assert.equal((routeSource.match(/\.limit\(limit\)/g) ?? []).length, 8)
    assert.doesNotMatch(routeSource, /select\([^)]*\b(?:email|phone|notes|tax_number|password|token)\b/i)
    assert.match(routeSource, /Cache-Control': 'private, no-store'/)
  })

  it('debounces requests, cancels stale workspace searches and supports keyboard navigation', () => {
    assert.match(componentSource, /setTimeout\(async/)
    assert.match(componentSource, /controller\.abort\(\)/)
    assert.match(componentSource, /event\.key === 'ArrowDown'/)
    assert.match(componentSource, /event\.key === 'Enter'/)
    assert.doesNotMatch(componentSource, /\.limit\(100\)/)
    assert.doesNotMatch(componentSource, /from\('(?:incomes|expenses|time_entries)'\)/)
  })
})
