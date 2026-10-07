import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { productMenuDictionaries } from './product-menu-i18n.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { productPhotoSessionDictionaries } from './product-photo-session-i18n.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildProductMenuDocument } from './product-menu.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { assessProductImportDraft, mergeProductImportDrafts, parseProductExtraction, validateProductImportDraft } from './product-photo-import.ts'

test('normalizes only credible image extraction fields into editable drafts', () => {
  const drafts = parseProductExtraction({ products: [
    { position: ' 12 ', barcode: ' 4006381333931 ', name: 'Espresso', description: 'Double shot', price: '3,50 EUR', category: 'Coffee' },
    { position: null, name: null, description: null, price: null, category: null },
  ] }, 'menu.jpg')
  assert.deepEqual(drafts, [{ id:'menu.jpg-1',include:true,sku:'12',barcode:'4006381333931',name:'Espresso',description:'Double shot',price:'3.50',category:'Coffee',sourceNames:['menu.jpg'],mergeConflicts:[],reviewedAsNew:false }])
})

test('merges the same strong identifier across photos without creating duplicate drafts', () => {
  const first = parseProductExtraction({ products: [{ sku:'12',barcode:null,name:'Espresso',price:3.5 }] }, 'shelf.jpg')
  const second = parseProductExtraction({ products: [{ sku:'12',barcode:'4006381333931',name:'Espresso',description:'Double shot',price:3.5 }] }, 'label.jpg')
  const merged = mergeProductImportDrafts(first, second)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].barcode, '4006381333931')
  assert.deepEqual(merged[0].sourceNames, ['shelf.jpg', 'label.jpg'])
})

test('classifies strong existing matches, name suggestions and invalid rows safely', () => {
  const [existingDraft, possibleDraft] = parseProductExtraction({ products: [
    { sku:'12',name:'Espresso',price:3.5 },
    { name:'Coffee Beans Premium',price:null },
  ] })
  const existingProducts = [
    { id:'product-1',sku:'12',barcode:null,name:'Existing espresso' },
    { id:'product-2',sku:'77',barcode:null,name:'Coffee Beans Premium' },
  ]
  assert.equal(assessProductImportDraft(existingDraft, existingProducts, [existingDraft, possibleDraft]).status, 'existing')
  const possible = assessProductImportDraft(possibleDraft, existingProducts, [existingDraft, possibleDraft])
  assert.equal(possible.status, 'possible_match')
  assert.equal(possible.needsReview, true)
  assert.equal(assessProductImportDraft({ ...possibleDraft, reviewedAsNew:true }, existingProducts, [existingDraft, { ...possibleDraft, reviewedAsNew:true }]).needsReview, false)
  assert.equal(validateProductImportDraft({ ...existingDraft, name:'' }), 'name_required')
})

test('keeps conflicting identifiers visible for human resolution', () => {
  const first = parseProductExtraction({ products: [{ sku:'12',barcode:'111',name:'Espresso',price:3.5 }] }, 'one.jpg')
  const second = parseProductExtraction({ products: [{ sku:'12',barcode:'222',name:'Espresso',price:3.5 }] }, 'two.jpg')
  const merged = mergeProductImportDrafts(first, second)
  assert.equal(merged.length, 1)
  assert.deepEqual(merged[0].mergeConflicts, ['barcode_conflict'])
  assert.equal(assessProductImportDraft(merged[0], [], merged).status, 'conflict')
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
  assert.match(source, /duplicate_barcode/)
})

test('photo import UI supports one review session without a desktop-only wide table', () => {
  const source = readFileSync(new URL('../components/products/product-photo-import-dialog.tsx', import.meta.url), 'utf8')
  assert.match(source, /type="file" multiple/)
  assert.match(source, /mergeProductImportDrafts/)
  assert.match(source, /status === 'failed'/)
  assert.match(source, /reviewedAsNew/)
  assert.doesNotMatch(source, /min-w-\[1050px\]|<table/)
})

test('product photo and menu labels cover all seven locales', () => {
  const expected = Object.keys(productMenuDictionaries.en).sort()
  for (const [locale, dictionary] of Object.entries(productMenuDictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), expected, locale)
    for (const key of expected) assert.ok(dictionary[key]?.trim(), `${locale}:${key}`)
  }
  const expectedPhoto = Object.keys(productPhotoSessionDictionaries.en).sort()
  for (const [locale, dictionary] of Object.entries(productPhotoSessionDictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), expectedPhoto, locale)
    for (const key of expectedPhoto) assert.ok(dictionary[key]?.trim(), `${locale}:${key}`)
  }
})
