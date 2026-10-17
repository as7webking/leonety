import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/(app)/products/categories/page.tsx', import.meta.url), 'utf8')
const wooRoute = readFileSync(new URL('../app/api/woocommerce/categories/route.ts', import.meta.url), 'utf8')
const wooSync = readFileSync(new URL('../app/api/woocommerce/products/sync/route.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('./product-categories-i18n.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../supabase/migrations/20260919205522.sql', import.meta.url), 'utf8')
const productEdit = readFileSync(new URL('../app/(app)/products/[productId]/edit/page.tsx', import.meta.url), 'utf8')
const productsPage = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')

test('category management reuses workspace-scoped canonical categories and counts products', () => {
  assert.match(page, /from\('product_categories'\)/)
  assert.match(page, /from\('products'\)\.select\('category_id'\)/)
  assert.match(page, /\.eq\('company_id', currentCompany\.id\)/)
  assert.match(page, /\.eq\('category_id', deletingCategory\.id\)/)
  assert.match(migration, /create table if not exists public\.product_categories/)
  assert.match(migration, /product_categories_company_name_unique[\s\S]*lower\(name\)/)
  assert.match(migration, /category_id uuid references public\.product_categories\(id\) on delete set null/)
})

test('deleting a used category requires an explicit product reassignment choice', () => {
  assert.match(page, /deleteImpact/)
  assert.match(page, /reassignTo/)
  assert.match(page, /category_id: target\?\.id \?\? null, category: target\?\.name \?\? null/)
  assert.match(page, /const count = productCounts\[deletingCategory\.id\] \?\? 0/)
})

test('WooCommerce mapping uses owner-authorized provider categories and the canonical stored mapping', () => {
  assert.match(wooRoute, /requireOwnedCompany\(companyId\)/)
  assert.match(wooRoute, /decryptSecret\(/)
  assert.doesNotMatch(wooRoute, /consumer_key:.*return|consumer_secret:.*return/)
  assert.match(page, /woo_category_id/)
  assert.match(page, /api\/woocommerce\/categories/)
  assert.match(wooSync, /select\('woo_category_id'\)/)
  assert.match(wooSync, /categoryId = mappedId/)
})

test('WooCommerce categories are created only after an explicit owner-authorized action', () => {
  assert.match(wooRoute, /export async function POST/)
  assert.match(wooRoute, /requireOwnedCompany\(companyId\)/)
  assert.match(wooRoute, /method: 'POST'/)
  assert.match(page, /createAndMapWooCategory/)
  assert.match(page, /onClick=\{\(\) => void createAndMapWooCategory\(category\)\}/)
  assert.doesNotMatch(wooSync, /findOrCreateCategory/)
  assert.doesNotMatch(wooSync, /method: 'POST',[\s\S]*?\/products\/categories/)
})

test('product WooCommerce category defaults to inheritance and supports a persisted per-product override', () => {
  assert.match(productEdit, /woo_category_id: string/)
  assert.match(productEdit, /select\('id, company_id, name, woo_category_id'\)/)
  assert.match(productEdit, /products\.wooInherited/)
  assert.match(productEdit, /products\.wooOverridden/)
  assert.match(productEdit, /updateChannelOverride\('woocommerce', \{ woo_category_id: value \}\)/)
  assert.match(wooSync, /product_channel_preferences/)
  assert.match(wooSync, /hasOwnProperty\.call\(body, 'wooCategoryId'\)/)
  assert.match(wooSync, /products\/categories\/\$\{categoryId\}/)
  assert.match(wooSync, /republishAsNew/)
  assert.match(wooSync, /providerCode\?\.includes\('product_invalid_id'\)/)
  assert.match(productEdit, /products\.wooRepublishConfirm/)
  assert.match(productEdit, /republishAsNew: true/)
})

test('bulk WooCommerce publish reviews creates, updates and blocked category mappings before execution', () => {
  assert.match(productsPage, /openWooPublishPreview/)
  assert.match(productsPage, /products\.wooBulkPreview/)
  assert.match(productsPage, /products\.wooPreviewCreate/)
  assert.match(productsPage, /products\.wooPreviewUpdate/)
  assert.match(productsPage, /products\.wooPreviewBlocked/)
  assert.match(productsPage, /runWooPublishPreview/)
  assert.match(productsPage, /entry\.action !== 'blocked'/)
  assert.match(productsPage, /wooCategoryId = overrideId \?\? category\?\.woo_category_id/)
})

test('category management labels are present in all supported locales', () => {
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr']) {
    assert.match(i18n, new RegExp(`${locale}: \\{`))
  }
  assert.equal((i18n.match(/'productCategories\.title'/g) ?? []).length, 7)
  assert.equal((i18n.match(/'productCategories\.deleteImpact'/g) ?? []).length, 7)
})
