import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const productsPage = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')
const i18nSource = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8')
const productUxSource = readFileSync(new URL('./product-inventory-ux-i18n.ts', import.meta.url), 'utf8')
const productCsvDialog = readFileSync(new URL('../components/products/product-csv-dialog.tsx', import.meta.url), 'utf8')

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

  assert.match(productsPage, /ProductCsvDialog/)
  for (const format of ['leonety', 'woocommerce', 'shopify', 'google_basic']) assert.match(productCsvDialog, new RegExp(`value:'${format}'`))
  assert.match(productsPage, /handleWooExportAll/)
  assert.match(productsPage, /\/app\/settings\/integrations\/woocommerce/)
  assert.match(productsPage, /\/app\/stock-movements/)
})

test('import and export panel label is localized in every supported locale', () => {
  assert.equal(i18nSource.match(/'products\.importExport':/g)?.length, 7)
})

test('desktop products fit the authenticated content width without a forced wide table', () => {
  assert.doesNotMatch(productsPage, /min-w-\[1120px\]/)
  assert.match(productsPage, /xl:grid-cols-3 2xl:grid-cols-/)
  assert.match(productsPage, /<table className="w-full table-fixed text-sm">/)
})

test('category rename keeps category rows and canonical products in the same workspace', () => {
  assert.match(productsPage, /from\('product_categories'\)[\s\S]*\.update\(\{ name: nextName/)
  assert.match(productsPage, /from\('products'\)[\s\S]*\.eq\('category_id', category\.id\)/)
  assert.equal(productUxSource.match(/renameCategory:/g)?.length, 7)
})
