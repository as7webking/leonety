import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  toWooPrice,
  toWooStock,
  wooRequest,
  type WooConnection,
  type WooProductPayload,
  type WooVariationPayload,
} from '@/lib/woocommerce'

export const runtime = 'nodejs'

interface WooConnectionRow extends WooConnection {
  active: boolean
}

interface ProductRow {
  id: string
  company_id: string
  name: string
  sku: string | null
  barcode: string | null
  category: string | null
  description: string | null
  selling_price: number | string | null
  current_stock: number | string
  image_url?: string | null
  woo_product_type?: 'simple' | 'variable' | null
  woo_attributes?: unknown
  woo_variants?: unknown
}

interface ProductSyncRow {
  external_product_id: string | null
}

interface WooProductResponse {
  id: number
}

interface WooCategory {
  id: number
  name: string
}

interface WooVariationResponse {
  id: number
  sku?: string
  attributes?: Array<{ name: string; option: string }>
}

interface VariantInput {
  sku?: string
  price?: string | number | null
  stock_quantity?: string | number | null
  attributes?: Record<string, string>
}

function arrayFromJson(value: unknown) {
  return Array.isArray(value) ? value : []
}

function variantKey(variation: WooVariationResponse | WooVariationPayload) {
  return (variation.attributes ?? [])
    .map((attribute) => `${attribute.name}:${attribute.option}`)
    .sort()
    .join('|')
    .toLowerCase()
}

async function findOrCreateCategory(connection: WooConnection, categoryName: string | null) {
  const name = categoryName?.trim()
  if (!name) return undefined

  const categories = await wooRequest<WooCategory[]>(
    connection,
    `/products/categories?search=${encodeURIComponent(name)}&per_page=20`
  )
  const existing = categories.find((category) => category.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing.id

  const created = await wooRequest<WooCategory>(connection, '/products/categories', {
    method: 'POST',
    body: { name },
  })

  return created.id
}

function buildBasePayload(product: ProductRow, categoryId?: number, includeImage = true): WooProductPayload {
  const productType = product.woo_product_type === 'variable' ? 'variable' : 'simple'
  const price = toWooPrice(product.selling_price === null ? null : Number(product.selling_price))
  const stock = toWooStock(Number(product.current_stock))
  const attributes = arrayFromJson(product.woo_attributes)
    .map((attribute) => {
      if (!attribute || typeof attribute !== 'object') return null
      const record = attribute as { name?: unknown; options?: unknown }
      const name = typeof record.name === 'string' ? record.name.trim() : ''
      const options = Array.isArray(record.options)
        ? record.options.map((option) => String(option).trim()).filter(Boolean)
        : []

      if (!name || options.length === 0) return null

      return { name, options, variation: true, visible: true }
    })
    .filter(Boolean) as NonNullable<WooProductPayload['attributes']>

  const payload: WooProductPayload = {
    name: product.name,
    type: productType,
    description: product.description ?? '',
    short_description: product.category ?? '',
    sku: product.sku ?? undefined,
    categories: categoryId ? [{ id: categoryId }] : undefined,
    images: includeImage && product.image_url ? [{ src: product.image_url }] : undefined,
    meta_data: [
      { key: 'leonety_product_id', value: product.id },
      { key: 'barcode', value: product.barcode ?? '' },
      { key: 'leonety_yay_attributes', value: JSON.stringify(product.woo_attributes ?? []) },
      { key: 'leonety_yay_variants', value: JSON.stringify(product.woo_variants ?? []) },
    ],
  }

  if (productType === 'variable') {
    payload.attributes = attributes
  } else {
    payload.regular_price = price
    payload.manage_stock = true
    payload.stock_quantity = stock
  }

  return payload
}

function buildVariationPayloads(product: ProductRow): WooVariationPayload[] {
  return arrayFromJson(product.woo_variants)
    .map((variant) => {
      if (!variant || typeof variant !== 'object') return null
      const record = variant as VariantInput
      const attributes = Object.entries(record.attributes ?? {})
        .map(([name, option]) => ({ name, option: String(option).trim() }))
        .filter((attribute) => attribute.name && attribute.option)

      if (attributes.length === 0) return null

      return {
        sku: record.sku?.trim() || undefined,
        regular_price: toWooPrice(record.price === null || record.price === undefined ? null : Number(record.price)),
        manage_stock: true,
        stock_quantity: toWooStock(record.stock_quantity === null || record.stock_quantity === undefined ? 0 : Number(record.stock_quantity)),
        attributes,
      }
    })
    .filter(Boolean) as WooVariationPayload[]
}

async function getWooImageWarning(imageUrl: string | null | undefined) {
  if (!imageUrl) return null

  const url = imageUrl.split('?')[0].toLowerCase()
  if (!url.endsWith('.jpg') && !url.endsWith('.jpeg')) {
    return 'Product synced without image because WooCommerce publishing requires JPG/JPEG. Upload the image through Leonety to compress it.'
  }

  try {
    const response = await fetch(imageUrl, { method: 'HEAD', cache: 'no-store' })
    const contentType = response.headers.get('content-type') ?? ''
    const contentLength = Number(response.headers.get('content-length') ?? 0)

    if (contentType && !contentType.toLowerCase().includes('jpeg')) {
      return 'Product synced without image because the image response is not JPEG.'
    }

    if (contentLength > 200 * 1024) {
      return 'Product synced without image because WooCommerce product images must be 200 KB or smaller.'
    }
  } catch (error) {
    return error instanceof Error ? error.message : 'Product synced without image because the image could not be checked.'
  }

  return null
}

async function upsertSyncStatus(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  productId: string,
    payload: {
    woo_product_id?: number | null
    sync_status: 'synced' | 'failed'
    error_message?: string | null
  }
) {
  await adminSupabase
    .from('product_syncs')
    .upsert({
      company_id: companyId,
      product_id: productId,
      channel: 'woocommerce',
      external_product_id: payload.woo_product_id ? String(payload.woo_product_id) : null,
      sync_status: payload.sync_status,
      error_message: payload.error_message ?? null,
      last_synced_at: payload.sync_status === 'synced' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,product_id,channel' })
}

export async function POST(request: Request) {
  let companyId = ''
  let productId = ''

  try {
    const body = await request.json().catch(() => ({}))
    companyId = typeof body.companyId === 'string' ? body.companyId : ''
    productId = typeof body.productId === 'string' ? body.productId : ''

    if (!productId) {
      return NextResponse.json({ error: 'Product is required.' }, { status: 400 })
    }

    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const [{ data: connection, error: connectionError }, { data: product, error: productError }, { data: syncRow, error: syncError }] = await Promise.all([
      auth.adminSupabase
        .from('woocommerce_connections')
        .select('store_url, consumer_key, consumer_secret, active')
        .eq('company_id', companyId)
        .maybeSingle(),
      auth.adminSupabase
        .from('products')
        .select('*')
        .eq('company_id', companyId)
        .eq('id', productId)
        .single(),
      auth.adminSupabase
        .from('product_syncs')
        .select('external_product_id')
        .eq('company_id', companyId)
        .eq('product_id', productId)
        .eq('channel', 'woocommerce')
        .maybeSingle(),
    ])

    if (connectionError) throw connectionError
    if (productError) throw productError
    if (syncError) throw syncError
    if (!connection?.active) {
      return NextResponse.json({ error: 'WooCommerce connection is not configured.' }, { status: 400 })
    }

    const wooConnection = connection as WooConnectionRow
    const productRow = product as ProductRow
    const imageWarning = await getWooImageWarning(productRow.image_url)
    const categoryId = await findOrCreateCategory(wooConnection, productRow.category)
    const payload = buildBasePayload(productRow, categoryId, !imageWarning)
    const existingWooId = Number((syncRow as ProductSyncRow | null)?.external_product_id ?? 0) || null
    const wooProduct = existingWooId
      ? await wooRequest<WooProductResponse>(wooConnection, `/products/${existingWooId}`, { method: 'PUT', body: payload })
      : await wooRequest<WooProductResponse>(wooConnection, '/products', { method: 'POST', body: payload })

    if (productRow.woo_product_type === 'variable') {
      const variations = buildVariationPayloads(productRow)
      const existingVariations = await wooRequest<WooVariationResponse[]>(
        wooConnection,
        `/products/${wooProduct.id}/variations?per_page=100`
      )

      for (const variation of variations) {
        const match = variation.sku
          ? existingVariations.find((existing) => existing.sku === variation.sku)
          : existingVariations.find((existing) => variantKey(existing) === variantKey(variation))

        if (match) {
          await wooRequest(wooConnection, `/products/${wooProduct.id}/variations/${match.id}`, {
            method: 'PUT',
            body: variation,
          })
        } else {
          await wooRequest(wooConnection, `/products/${wooProduct.id}/variations`, {
            method: 'POST',
            body: variation,
          })
        }
      }
    }

    await upsertSyncStatus(auth.adminSupabase, companyId, productId, {
      woo_product_id: wooProduct.id,
      sync_status: 'synced',
      error_message: imageWarning,
    })

    return NextResponse.json({ ok: true, wooProductId: wooProduct.id, warning: imageWarning })
  } catch (error) {
    const message = formatApiError(error)
    console.error('WooCommerce product sync failed:', { companyId, productId, message })

    if (companyId && productId) {
      const auth = await requireOwnedCompany(companyId)
      if (!('error' in auth)) {
        await upsertSyncStatus(auth.adminSupabase, companyId, productId, {
          sync_status: 'failed',
          error_message: message,
        })
      }
    }

    const status = message.includes('product_syncs') || message.includes('woocommerce_connections') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
