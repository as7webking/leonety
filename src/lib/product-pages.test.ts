import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('product create, detail and edit have dedicated App Router pages', () => {
  assert.match(read('../app/(app)/products/new/page.tsx'), /productUx\.offlineNotSynced/)
  assert.match(read('../app/(app)/products/[productId]/page.tsx'), /from\('products'\)/)
  assert.match(read('../app/(app)/products/[productId]/edit/page.tsx'), /from\('products'\)/)
  const list = read('../app/(app)/products/page.tsx')
  assert.match(list, /router\.push\('\/app\/products\/new'\)/)
  assert.match(list, /\/app\/products\/\$\{encodeURIComponent\(product\.id\)\}/)
})

test('edit uses an updated_at compare-and-set and keeps conflicted drafts for explicit resolution', () => {
  const edit = read('../app/(app)/products/[productId]/edit/page.tsx')
  assert.match(edit, /eq\('updated_at', product\.updated_at\)/)
  assert.match(edit, /reviewLocalDraftAgainstLatest/)
  assert.match(edit, /discardLocalDraftAndReload/)
})

test('product image API stores the validated format and does not force a second JPEG conversion', () => {
  const normalizeRoute = read('../app/api/product-images/normalize/route.ts')
  const importRoute = read('../app/api/product-images/import/route.ts')
  const migration = read('../../supabase/migrations/20261028120000_product_image_formats.sql')
  for (const source of [normalizeRoute, importRoute]) {
    assert.match(source, /normalizeProductImage\(/)
    assert.match(source, /contentType: normalized\.mimeType/)
    assert.match(source, /normalized\.mimeType === 'image\/png' \? 'png' : 'webp'/)
  }
  assert.match(migration, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
})

test('product list distinguishes failed integration status retrieval from disconnection', () => {
  const list = read('../app/(app)/products/page.tsx')
  assert.match(list, /response\.ok \? response\.json\(\) : \{ integrations: \[\], unavailable: true \}/)
  assert.match(list, /nextConnections\[channel\.channel\] = \{ provider: channel\.channel, status: 'error'/)
})
