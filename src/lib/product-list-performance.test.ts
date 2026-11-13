import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')

test('product list mounts only the viewport-appropriate representation after hydration and follows breakpoint changes', () => {
  assert.match(source, /useState<'compact' \| 'desktop'>\('compact'\)/)
  assert.match(source, /matchMedia\('\(min-width: 1024px\)'\)/)
  assert.match(source, /desktopQuery\.addEventListener\('change', updateViewport\)/)
  assert.match(source, /return \(\) => desktopQuery\.removeEventListener\('change', updateViewport\)/)
  assert.match(source, /productListViewport === 'compact' && <div className="grid min-w-0 gap-3 sm:grid-cols-2">/)
  assert.match(source, /productListViewport === 'desktop' && <Card>/)
  assert.match(source, /desktopQuery\.addListener\(updateViewport\)/)
  assert.match(source, /return \(\) => desktopQuery\.removeListener\(updateViewport\)/)
  assert.match(source, /productListViewport === 'compact' && <div className="mb-5 grid min-w-0 grid-cols-2 gap-2 lg:hidden">/)
  assert.match(source, /productListViewport === 'desktop' && <DesktopPageUtilities/)
})

test('product actions still operate on the full filtered result set, not only the mounted layout', () => {
  assert.match(source, /visibleProducts\.every\(\(product\) => current\.has\(product\.id\)\)/)
  assert.match(source, /new Set\(visibleProducts\.map\(\(product\) => product\.id\)\)/)
  assert.match(source, /visibleProductIds=\{visibleProducts\.map\(\(product\) => product\.id\)\}/)
  assert.match(source, /const handleWooExportAll = async \(\) => openWooPublishPreview\(visibleProducts\)/)
})

test('product toolbar preserves import, export, catalog, and primary actions in accessible groups', () => {
  for (const action of ['ProductCsvDialog', 'ProductPhotoImportDialog', 'ProductChannelComparisonDialog', 'handleWooExportAll', 'products.importToLeonety', 'productCategories.open', 'stock.title', 'nav.woocommerce']) {
    assert.ok(source.includes(action), `${action} remains available`)
  }
  assert.match(source, /<details className="group min-w-0 rounded-md border border-slate-200 bg-white open:col-span-2">[\s\S]*products\.importExport/)
  assert.match(source, /<summary[\s\S]*products\.catalogTools/)
  assert.match(source, /PageHeader[\s\S]*products\.add/)
  assert.match(source, /aria-label=\{t\('products\.view'\)\}/)
  assert.match(source, /title=\{t\('products\.archive'\)\} aria-label=\{t\('products\.archive'\)\}/)
})
