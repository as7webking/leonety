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
