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
})

test('product actions still operate on the full filtered result set, not only the mounted layout', () => {
  assert.match(source, /visibleProducts\.every\(\(product\) => current\.has\(product\.id\)\)/)
  assert.match(source, /new Set\(visibleProducts\.map\(\(product\) => product\.id\)\)/)
  assert.match(source, /visibleProductIds=\{visibleProducts\.map\(\(product\) => product\.id\)\}/)
  assert.match(source, /const handleWooExportAll = async \(\) => openWooPublishPreview\(visibleProducts\)/)
})
