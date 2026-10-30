import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { escapeGlobalSearchTerm, getGlobalQuickActions, globalSearchHref, normalizeGlobalSearchQuery } from './global-search.ts'

const routeSource = readFileSync(new URL('../app/api/global-search/route.ts', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('../components/app-search.tsx', import.meta.url), 'utf8')
const mobileShellSource = readFileSync(new URL('../components/app-shell/mobile-drawer-client.tsx', import.meta.url), 'utf8')

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
    assert.match(componentSource, /const groups: GlobalSearchGroup\[\] = \['clients', 'invoices', 'products', 'employees', 'contracts'\]/)
    assert.match(componentSource, /groupedResults\.map\(\(section\)/)
  })

  it('keeps quick actions aligned with workspace capabilities and existing routes', () => {
    assert.deepEqual(getGlobalQuickActions('personal').map((action) => action.id), ['income', 'expense', 'timer'])
    assert.deepEqual(getGlobalQuickActions('business').map((action) => action.id), ['invoice', 'client', 'product', 'income', 'expense', 'timer'])
    assert.deepEqual(getGlobalQuickActions('business').map((action) => action.href), [
      '/app/invoices?create=1', '/app/clients/new', '/app/products/new',
      '/app/income?create=1', '/app/expenses?create=1', '/app/time?start=1',
    ])
    assert.match(componentSource, /getGlobalQuickActions\(normalizeAppMode\(currentCompany\.type\)\)/)
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
    assert.match(componentSource, /event\.metaKey \|\| event\.ctrlKey/)
    assert.match(componentSource, /event\.key === 'Escape'/)
    assert.match(componentSource, /trapFocusWithin\(dialog, event\)/)
    assert.match(componentSource, /aria-modal="true"/)
    assert.match(componentSource, /role="option" aria-selected=\{index === activeIndex\}/)
  })

  it('exposes the command experience on mobile and quick actions open the real create flows', () => {
    assert.match(mobileShellSource, /leonety:open-command/)
    assert.match(mobileShellSource, /aria-label=\{t\('search\.label'\)\}/)
    assert.match(readFileSync(new URL('../app/(app)/invoices/page.tsx', import.meta.url), 'utf8'), /requestedGenericCreate/)
    assert.match(readFileSync(new URL('../app/(app)/income/page.tsx', import.meta.url), 'utf8'), /searchParams\.get\('create'\)/)
    assert.match(readFileSync(new URL('../app/(app)/expenses/page.tsx', import.meta.url), 'utf8'), /searchParams\.get\('create'\)/)
    assert.match(readFileSync(new URL('../app/(app)/time/page.tsx', import.meta.url), 'utf8'), /searchParams\.get\('start'\)/)
  })
})
