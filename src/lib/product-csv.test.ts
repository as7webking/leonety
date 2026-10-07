import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { classifyProductCsvRows, normalizeProductCsvRows, parseProductCsv } from './product-csv.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { productCsvDictionaries } from './product-csv-i18n.ts'

test('parses quoted Leonety CSV and suggests canonical field mapping', () => {
  const parsed = parseProductCsv('name,description,sku,price,stock\r\n"Coffee, large","Fresh\nbeans",COF-1,"3,50",4')
  assert.equal(parsed.format, 'leonety')
  assert.equal(parsed.mapping.name, 'name')
  assert.equal(parsed.rows[0].name, 'Coffee, large')
  assert.equal(parsed.rows[0].description, 'Fresh\nbeans')
  const [row] = normalizeProductCsvRows(parsed.rows, parsed.mapping, 'EUR')
  assert.equal(row.price, 3.5)
  assert.equal(row.stock, 4)
})

test('detects WooCommerce headers and maps identifiers without importing', () => {
  const parsed = parseProductCsv('ID,Type,SKU,Name,Regular price,Categories,Stock,Meta: barcode\n52,simple,A-1,Espresso,2.90,Coffee,8,40001')
  assert.equal(parsed.format, 'woocommerce')
  assert.equal(parsed.mapping.external_id, 'ID')
  assert.equal(parsed.mapping.barcode, 'Meta: barcode')
  const [row] = normalizeProductCsvRows(parsed.rows, parsed.mapping, 'EUR')
  assert.deepEqual({ externalId:row.externalId,sku:row.sku,barcode:row.barcode }, { externalId:'52',sku:'A-1',barcode:'40001' })
})

test('rejects empty, malformed and oversized CSV input', () => {
  assert.throws(() => parseProductCsv(''), /empty_csv/)
  assert.throws(() => parseProductCsv('name,name\na,b'), /duplicate_headers/)
  assert.throws(() => parseProductCsv('name\n"open'), /malformed_csv/)
  assert.throws(() => parseProductCsv('name\na\nb', 1), /too_many_rows/)
})

test('marks invalid numeric fields without changing product data', () => {
  const parsed = parseProductCsv('name,price,stock\nTest,-2,1.5')
  const [row] = normalizeProductCsvRows(parsed.rows, parsed.mapping, 'EUR')
  assert.deepEqual(row.errors.sort(), ['price_invalid', 'stock_invalid'])
})

test('classifies new, matched, duplicate and conflicting identifiers deterministically', () => {
  const base = normalizeProductCsvRows(parseProductCsv('name,sku,barcode\nNew,N-1,100\nMatch,MATCH,200\nDuplicate,DUP,300\nDuplicate 2,DUP,301\nConflict,OLD,999').rows, { name:'name',sku:'sku',barcode:'barcode' }, 'EUR')
  const classified = classifyProductCsvRows(base, [
    { id:'product-1',name:'Existing SKU',sku:'MATCH',barcode:null },
    { id:'product-3',name:'Other existing SKU',sku:'OLD',barcode:null },
    { id:'product-2',name:'Existing barcode',sku:null,barcode:'999' },
  ], [])
  assert.equal(classified[0].classification, 'new')
  assert.equal(classified[1].classification, 'existing')
  assert.equal(classified[1].matchedProductId, 'product-1')
  assert.equal(classified[2].classification, 'invalid')
  assert.equal(classified[3].classification, 'invalid')
  assert.equal(classified[4].classification, 'conflict')
})

test('CSV routes authenticate workspace and require preview confirmation', () => {
  const importRoute = readFileSync(new URL('../app/api/products/csv-import/route.ts', import.meta.url), 'utf8')
  const exportRoute = readFileSync(new URL('../app/api/products/csv-export/route.ts', import.meta.url), 'utf8')
  const csvSource = readFileSync(new URL('./product-csv.ts', import.meta.url), 'utf8')
  assert.match(importRoute, /requireOwnedCompany\(parsed\.data\.companyId\)/)
  assert.match(exportRoute, /requireOwnedCompany\(parsed\.data\.companyId\)/)
  assert.ok(importRoute.indexOf("if (!parsed.data.confirm)") < importRoute.indexOf("from('products').upsert"))
  assert.match(csvSource, /identifiers_match_different_products/)
  assert.match(csvSource, /duplicate_sku_in_file/)
  assert.match(csvSource, /duplicate_barcode_in_file/)
})

test('product CSV labels cover all seven locales', () => {
  const expected = Object.keys(productCsvDictionaries.en).sort()
  assert.equal(Object.keys(productCsvDictionaries).length, 7)
  for (const [locale, dictionary] of Object.entries(productCsvDictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), expected, locale)
    for (const key of expected) assert.ok(dictionary[key]?.trim(), `${locale}:${key}`)
  }
})
