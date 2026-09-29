import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { classifyProductCsvRows, productCsvFields, type ProductCsvField } from '@/lib/product-csv'

export const runtime = 'nodejs'

const rowSchema = z.object({
  sourceRow: z.number().int().min(2),
  name: z.string().max(500),
  description: z.string().max(20000),
  sku: z.string().max(255),
  barcode: z.string().max(255),
  category: z.string().max(255),
  price: z.number().min(0).nullable(),
  currency: z.string().max(10),
  stock: z.number().int().min(0),
  imageUrl: z.string().max(4000),
  status: z.enum(['active', 'inactive', 'archived']),
  externalId: z.string().max(255),
  errors: z.array(z.string()).max(10),
})

const requestSchema = z.object({
  companyId: z.string().uuid(),
  format: z.enum(['leonety', 'woocommerce']),
  rows: z.array(rowSchema).min(1).max(5000),
  fieldsPresent: z.array(z.enum(productCsvFields)).max(productCsvFields.length),
  confirm: z.boolean().optional().default(false),
  decisions: z.array(z.object({
    sourceRow: z.number().int().min(2),
    mode: z.enum(['create', 'update']),
    productId: z.string().uuid().optional(),
  })).max(5000).optional().default([]),
})

interface ExistingProduct {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  category: string | null
  category_id: string | null
  description: string | null
  selling_price: number | null
  currency: string
  current_stock: number
  image_url: string | null
  status: 'active' | 'inactive' | 'archived'
}

type Classification = 'new' | 'existing' | 'conflict' | 'invalid'

function normalizedIdentifier(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('en-US') ?? ''
}

function countClassifications(rows: Array<{ classification: Classification }>) {
  return rows.reduce((counts, row) => ({ ...counts, [row.classification]: counts[row.classification] + 1 }), { new: 0, existing: 0, conflict: 0, invalid: 0 })
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data: products, error: productsError } = await auth.adminSupabase
    .from('products')
    .select('id, name, sku, barcode, category, category_id, description, selling_price, currency, current_stock, image_url, status')
    .eq('company_id', parsed.data.companyId)
  if (productsError) return NextResponse.json({ error: 'products_unavailable' }, { status: 500 })

  const syncResult = parsed.data.format === 'woocommerce'
    ? await auth.adminSupabase.from('product_syncs').select('product_id, external_product_id').eq('company_id', parsed.data.companyId).eq('channel', 'woocommerce')
    : { data: [], error: null }
  if (syncResult.error) return NextResponse.json({ error: 'product_mappings_unavailable' }, { status: 500 })

  const existingProducts = (products ?? []) as ExistingProduct[]
  const classified = classifyProductCsvRows(parsed.data.rows, existingProducts, syncResult.data ?? [])
  if (!parsed.data.confirm) return NextResponse.json({ rows: classified, counts: countClassifications(classified) })

  const decisions = new Map(parsed.data.decisions.map((decision) => [decision.sourceRow, decision]))
  const selected = classified.filter((row) => decisions.has(row.sourceRow))
  if (selected.length === 0) return NextResponse.json({ error: 'nothing_selected' }, { status: 400 })

  for (const row of selected) {
    const decision = decisions.get(row.sourceRow)!
    if (row.classification === 'invalid' || row.classification === 'conflict') {
      return NextResponse.json({ error: 'preview_changed', row: row.sourceRow }, { status: 409 })
    }
    if (decision.mode === 'create' && row.classification !== 'new') {
      return NextResponse.json({ error: 'preview_changed', row: row.sourceRow }, { status: 409 })
    }
    if (decision.mode === 'update' && (row.classification !== 'existing' || decision.productId !== row.matchedProductId)) {
      return NextResponse.json({ error: 'preview_changed', row: row.sourceRow }, { status: 409 })
    }
  }

  const fields = new Set<ProductCsvField>(parsed.data.fieldsPresent)
  const categoryNames = [...new Set(selected.map((row) => row.category.trim()).filter(Boolean))]
  const { data: existingCategories } = await auth.adminSupabase
    .from('product_categories')
    .select('id, name')
    .eq('company_id', parsed.data.companyId)
  const knownCategories = new Map((existingCategories ?? []).map((category) => [normalizedIdentifier(category.name), category.id]))
  const missingCategories = categoryNames.filter((name) => !knownCategories.has(normalizedIdentifier(name)))
  if (missingCategories.length > 0) {
    const { error: categoryError } = await auth.adminSupabase.from('product_categories').insert(missingCategories.map((name) => ({
      company_id: parsed.data.companyId,
      name,
      slug: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `category-${crypto.randomUUID().slice(0, 8)}`,
    })))
    if (categoryError && categoryError.code !== '23505') return NextResponse.json({ error: 'category_import_failed' }, { status: 409 })
  }

  const { data: refreshedCategories } = await auth.adminSupabase.from('product_categories').select('id, name').eq('company_id', parsed.data.companyId)
  const categoryIds = new Map((refreshedCategories ?? []).map((category) => [normalizedIdentifier(category.name), category.id]))
  const productById = new Map(existingProducts.map((product) => [product.id, product]))

  const records = selected.map((row) => {
    const decision = decisions.get(row.sourceRow)!
    const existing = decision.productId ? productById.get(decision.productId) : undefined
    return {
      id: existing?.id ?? crypto.randomUUID(),
      company_id: parsed.data.companyId,
      name: row.name,
      description: fields.has('description') ? row.description || null : existing?.description ?? null,
      sku: fields.has('sku') ? row.sku || null : existing?.sku ?? null,
      barcode: fields.has('barcode') ? row.barcode || null : existing?.barcode ?? null,
      category: fields.has('category') ? row.category || null : existing?.category ?? null,
      category_id: fields.has('category') ? categoryIds.get(normalizedIdentifier(row.category)) ?? null : existing?.category_id ?? null,
      selling_price: fields.has('price') ? row.price : existing?.selling_price ?? null,
      currency: fields.has('currency') ? row.currency : existing?.currency ?? row.currency,
      current_stock: fields.has('stock') ? row.stock : existing?.current_stock ?? 0,
      image_url: fields.has('image_url') ? row.imageUrl || null : existing?.image_url ?? null,
      status: fields.has('status') ? row.status : existing?.status ?? 'active',
      updated_at: new Date().toISOString(),
    }
  })

  const { error: upsertError } = await auth.adminSupabase.from('products').upsert(records, { onConflict: 'id' })
  if (upsertError) {
    const duplicate = upsertError.code === '23505'
    return NextResponse.json({ error: duplicate ? 'duplicate_identifier' : 'import_failed' }, { status: duplicate ? 409 : 500 })
  }

  if (parsed.data.format === 'woocommerce') {
    const mappings = selected.flatMap((row, index) => row.externalId ? [{
      company_id: parsed.data.companyId,
      product_id: records[index].id,
      channel: 'woocommerce',
      external_product_id: row.externalId,
      sync_status: 'not_synced',
      updated_at: new Date().toISOString(),
    }] : [])
    if (mappings.length > 0) {
      const { error: mappingError } = await auth.adminSupabase.from('product_syncs').upsert(mappings, { onConflict: 'company_id,product_id,channel' })
      if (mappingError) return NextResponse.json({ error: 'mapping_import_failed' }, { status: 500 })
    }
  }

  return NextResponse.json({
    created: selected.filter((row) => row.classification === 'new').length,
    updated: selected.filter((row) => row.classification === 'existing').length,
  })
}
