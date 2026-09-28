import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const productsPage = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')
const i18nSource = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8')

test('mobile products prioritize add, search and two compact disclosure panels', () => {
  assert.match(productsPage, /mb-4 lg:hidden[\s\S]*products\.add/)
  assert.match(productsPage, /relative mb-3 lg:hidden[\s\S]*products\.search/)
  assert.match(productsPage, /grid min-w-0 grid-cols-2 gap-2 lg:hidden/)
  assert.match(productsPage, /t\('common\.filters'\)/)
  assert.match(productsPage, /t\('products\.importExport'\)/)
})

test('collapsed product controls keep every existing filter and export action mounted', () => {
  for (const field of ['statusFilter', 'sortBy', 'categoryFilter', 'stockFilter', 'providerFilter', 'imageFilter']) {
    assert.match(productsPage, new RegExp(`value=\\{${field}\\}`))
  }

  for (const format of ['generic', 'shopify', 'google']) {
    assert.match(productsPage, new RegExp(`exportProducts\\('${format}', visibleProducts\\)`))
  }
  assert.match(productsPage, /handleWooExportAll/)
  assert.match(productsPage, /\/app\/settings\/integrations\/woocommerce/)
  assert.match(productsPage, /\/app\/stock-movements/)
})

test('import and export panel label is localized in every supported locale', () => {
  assert.equal(i18nSource.match(/'products\.importExport':/g)?.length, 7)
})
