import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { productMenuDictionaries } from './product-menu-i18n.ts'
import { buildProductMenuDocument } from './product-menu.ts'
import { findSkuDuplicate, parseProductExtraction, validateProductImportDraft } from './product-photo-import.ts'

test('normalizes only credible image extraction fields into editable drafts', () => {
  const drafts = parseProductExtraction({ products: [
    { position: ' 12 ', name: 'Espresso', description: 'Double shot', price: '3,50 EUR', category: 'Coffee' },
    { position: null, name: null, description: null, price: null, category: null },
  ] })
  assert.deepEqual(drafts, [{ id:'draft-1',include:true,position:'12',name:'Espresso',description:'Double shot',price:'3.50',category:'Coffee' }])
})

test('requires draft names and detects existing and in-review SKU duplicates', () => {
  const drafts = parseProductExtraction({ products: [
    { position:'12',name:'Espresso',price:3.5 },
    { position:'12',name:'Cappuccino',price:4 },
  ] })
  assert.equal(findSkuDuplicate('12', [{ id:'product-1',sku:'12',name:'Existing espresso' }], drafts, drafts[0].id)?.kind, 'existing')
  assert.equal(findSkuDuplicate('12', [], drafts, drafts[0].id)?.kind, 'draft')
  assert.equal(validateProductImportDraft({ ...drafts[0], name:'' }), 'name_required')
})

test('menu output contains only supplied canonical products and no reference-image content', () => {
  const html = buildProductMenuDocument([{ id:'1',name:'Espresso',description:'Double shot',category:'Coffee',sku:'12',sellingPrice:3.5,currency:'EUR',imageUrl:null }], {
    template:'custom',title:'Menu',companyName:'Test Company',uncategorizedLabel:'Other',showDescriptions:true,showImages:true,showArticles:true,
    customColors:{ background:'#ffffff',foreground:'#111111',accent:'#aa0000' },
  })
  assert.match(html, /Espresso/)
  assert.match(html, /Double shot/)
  assert.match(html, /Test Company/)
  assert.doesNotMatch(html, /referenceDataUrl|template reference/i)
})

test('photo extraction authenticates the workspace and does not store the source image', () => {
  const source = readFileSync(new URL('../app/api/products/photo-import/route.ts', import.meta.url), 'utf8')
  assert.ok(source.indexOf('requireOwnedCompany(companyId)') < source.indexOf('generateAiVisionJson({'))
  assert.doesNotMatch(source, /storage\.from|\.upload\(/)
  assert.match(source, /\.from\('products'\)\.insert\(rows\)/)
})

test('product photo and menu labels cover all seven locales', () => {
  const expected = Object.keys(productMenuDictionaries.en).sort()
  for (const [locale, dictionary] of Object.entries(productMenuDictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), expected, locale)
    for (const key of expected) assert.ok(dictionary[key]?.trim(), `${locale}:${key}`)
  }
})
