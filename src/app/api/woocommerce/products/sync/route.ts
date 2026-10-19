import { NextResponse } from 'next/server'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { decryptSecret } from '@/lib/credential-encryption'
import { safeExternalHttpUrl } from '@/lib/external-url'
import { findLeonetyWooProduct, getWooImageWarning, isLeonetyWooProduct, persistPublishedWooMapping } from '@/lib/woocommerce-sync-safety'
import {
  toWooPrice,
  toWooStock,
  wooRequest,
  WooRequestError,
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
  category_id?: string | null
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
  permalink?: string
  meta_data?: Array<{ key?: string; value?: unknown }>
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

async function upsertSyncStatus(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  productId: string,
  payload: {
    woo_product_id?: number | null
    external_url?: string | null
    sync_status: 'synced' | 'failed'
    error_message?: string | null
  }
) {
  const row: Record<string, unknown> = {
    company_id: companyId,
    product_id: productId,
    channel: 'woocommerce',
    sync_status: payload.sync_status,
    error_message: payload.error_message ?? null,
    updated_at: new Date().toISOString(),
  }
  if (payload.sync_status === 'synced') row.last_synced_at = new Date().toISOString()
  if (payload.woo_product_id !== undefined) {
    row.external_product_id = payload.woo_product_id ? String(payload.woo_product_id) : null
  }
  if (payload.external_url !== undefined) row.external_url = payload.external_url

  const { error } = await adminSupabase
    .from('product_syncs')
    .upsert(row, { onConflict: 'company_id,product_id,channel' })

  if (error) throw new Error('sync_mapping_persistence_failed')
}

export async function POST(request: Request) {
  let companyId = ''
  let productId = ''
  let existingWooProductId: number | null = null
  let publishedWooProduct: WooProductResponse | null = null
  let republishAsNew = false

  try {
    const body = await request.json().catch(() => ({}))
    republishAsNew = body.republishAsNew === true
    const requestedReconciliationId = Number(body.reconcileWooProductId)
    const reconcileWooProductId = Number.isSafeInteger(requestedReconciliationId) && requestedReconciliationId > 0
      ? requestedReconciliationId
      : null
    companyId = typeof body.companyId === 'string' ? body.companyId : ''
    productId = typeof body.productId === 'string' ? body.productId : ''

    if (!productId) {
      return NextResponse.json({ error: 'Product is required.' }, { status: 400 })
    }

    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const [{ data: connection, error: connectionError }, { data: product, error: productError }, { data: syncRow, error: syncError }, { data: preference, error: preferenceError }] = await Promise.all([
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
      auth.adminSupabase
        .from('product_channel_preferences')
        .select('overrides')
        .eq('company_id', companyId)
        .eq('product_id', productId)
        .eq('provider', 'woocommerce')
        .maybeSingle(),
    ])

    if (connectionError) throw connectionError
    if (productError) throw productError
    if (syncError) throw syncError
    if (preferenceError && !['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(preferenceError.code ?? '')) throw preferenceError
    if (!connection?.active) {
      return NextResponse.json({ error: 'WooCommerce connection is not configured.' }, { status: 400 })
    }

    const savedConnection = connection as WooConnectionRow
    const wooConnection = {
      ...savedConnection,
      consumer_key: decryptSecret(savedConnection.consumer_key),
      consumer_secret: decryptSecret(savedConnection.consumer_secret),
    }
    const productRow = product as ProductRow
    const imageWarning = getWooImageWarning(productRow.image_url)
    let categoryId: number | undefined
    const overrides = preference?.overrides && typeof preference.overrides === 'object'
      ? preference.overrides as { woo_category_id?: unknown }
      : null
    const overrideValue = Object.prototype.hasOwnProperty.call(body, 'wooCategoryId')
      ? typeof body.wooCategoryId === 'string' ? body.wooCategoryId.trim() : ''
      : typeof overrides?.woo_category_id === 'string' ? overrides.woo_category_id.trim() : ''
    if (overrideValue) {
      const parsedOverride = Number(overrideValue)
      if (!Number.isSafeInteger(parsedOverride) || parsedOverride <= 0) {
        await upsertSyncStatus(auth.adminSupabase, companyId, productId, { sync_status: 'failed', error_message: 'The WooCommerce category override is invalid. Choose a category again.' })
        return NextResponse.json({ error: 'The WooCommerce category override is invalid. Choose a category again.' }, { status: 400 })
      }
      categoryId = parsedOverride
    } else if (productRow.category_id) {
      const { data: category, error: categoryError } = await auth.adminSupabase
        .from('product_categories')
        .select('woo_category_id')
        .eq('company_id', companyId)
        .eq('id', productRow.category_id)
        .maybeSingle()
      if (categoryError) throw categoryError
      const mappedId = category?.woo_category_id ? Number(category.woo_category_id) : NaN
      if (Number.isFinite(mappedId) && mappedId > 0) categoryId = mappedId
    }
    if (productRow.category?.trim() && !categoryId) {
      const message = 'Map the Leonety category to WooCommerce, or choose a product-specific WooCommerce category before publishing.'
      await upsertSyncStatus(auth.adminSupabase, companyId, productId, { sync_status: 'failed', error_message: message })
      return NextResponse.json({ error: 'Map the Leonety category to WooCommerce, or choose a product-specific WooCommerce category before publishing.' }, { status: 409 })
    }
    if (categoryId) {
      try {
        await wooRequest<WooCategory>(wooConnection, `/products/categories/${categoryId}`)
      } catch (error) {
        if (error instanceof WooRequestError && error.status === 404) {
          const message = 'The selected WooCommerce category no longer exists. Choose a current category or update the Leonety mapping.'
          await upsertSyncStatus(auth.adminSupabase, companyId, productId, { sync_status: 'failed', error_message: message })
          return NextResponse.json({ error: message }, { status: 409 })
        }
        throw error
      }
    }
    const payload = buildBasePayload(productRow, categoryId, !imageWarning)
    let existingWooId = Number((syncRow as ProductSyncRow | null)?.external_product_id ?? 0) || null
    if (reconcileWooProductId && republishAsNew) {
      return NextResponse.json({ error: 'A product awaiting mapping recovery cannot be republished as a new item.' }, { status: 409 })
    }

    if (reconcileWooProductId) {
      const candidate = await wooRequest<WooProductResponse>(wooConnection, `/products/${reconcileWooProductId}`)
      if (!isLeonetyWooProduct(candidate, productId)) {
        return NextResponse.json({ error: 'The WooCommerce item could not be verified as this Leonety product. No changes were made.' }, { status: 409 })
      }
      existingWooId = candidate.id
    } else if (!existingWooId && productRow.sku?.trim()) {
      const skuCandidates = await wooRequest<WooProductResponse[]>(wooConnection, `/products?sku=${encodeURIComponent(productRow.sku.trim())}`)
      const match = findLeonetyWooProduct(skuCandidates, productId)
      if (match.ambiguous) {
        return NextResponse.json({ error: 'More than one WooCommerce item matches this Leonety product. No duplicate was created; resolve the mapping before retrying.' }, { status: 409 })
      }
      if (match.product) existingWooId = match.product.id
    }
    if (existingWooId && republishAsNew) {
      try {
        await wooRequest<WooProductResponse>(wooConnection, `/products/${existingWooId}`)
        return NextResponse.json({ error: 'The mapped WooCommerce product still exists. Update it instead of creating another product.' }, { status: 409 })
      } catch (error) {
        if (!(error instanceof WooRequestError && error.status === 404 && error.providerCode?.includes('product_invalid_id'))) throw error
        existingWooId = null
      }
    }
    existingWooProductId = existingWooId
    const wooProduct = existingWooId
      ? await wooRequest<WooProductResponse>(wooConnection, `/products/${existingWooId}`, { method: 'PUT', body: payload })
      : await wooRequest<WooProductResponse>(wooConnection, '/products', { method: 'POST', body: payload })
    publishedWooProduct = wooProduct
    existingWooProductId = wooProduct.id

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

    const mappingResult = await persistPublishedWooMapping(wooProduct, async (published) => {
      await upsertSyncStatus(auth.adminSupabase, companyId, productId, {
        woo_product_id: published.id,
        external_url: safeExternalHttpUrl(published.permalink),
        sync_status: 'synced',
        error_message: imageWarning,
      })
    })
    if (mappingResult.status === 'mapping_failed') {
      return NextResponse.json({
        error: 'WooCommerce published the product, but Leonety could not save its mapping. Retry sync to reconcile the existing WooCommerce item; no new item should be created.',
        providerPublished: true,
        reconciliationWooProductId: mappingResult.reconciliationWooProductId,
        externalUrl: safeExternalHttpUrl(wooProduct.permalink),
      }, { status: 502 })
    }

    publishedWooProduct = null

    return NextResponse.json({ ok: true, wooProductId: wooProduct.id, externalUrl: safeExternalHttpUrl(wooProduct.permalink), warning: imageWarning })
  } catch (error) {
    const providerStatus = error instanceof WooRequestError ? error.status : null
    const message = error instanceof WooRequestError && error.status === 404 && existingWooProductId && error.providerCode?.includes('product_invalid_id')
      ? 'The mapped WooCommerce product no longer exists. Confirm publishing as a new product to create a replacement.'
      : error instanceof WooRequestError && error.status === 404 && existingWooProductId
        ? `WooCommerce returned 404 for mapped product ${existingWooProductId}. The mapping was retained and no duplicate was created; verify the REST API endpoint before retrying.`
        : providerStatus === 401
          ? 'WooCommerce rejected the connection credentials. Check the store connection.'
          : providerStatus === 403
            ? 'WooCommerce denied this operation. Check the REST API key permissions.'
            : providerStatus === 429
              ? 'WooCommerce rate limit reached. Wait a moment, then retry.'
              : providerStatus !== null && providerStatus >= 500
                ? 'WooCommerce is temporarily unavailable. Retry the sync later.'
                : 'WooCommerce product sync failed. Check the connection and try again.'

    if (publishedWooProduct) {
      console.error('WooCommerce published product; sync completion failed.', { companyId, productId })
      return NextResponse.json({
        error: 'WooCommerce accepted the product, but Leonety could not complete synchronization. Retry sync to reconcile the existing item; no new item should be created.',
        providerPublished: true,
        reconciliationWooProductId: publishedWooProduct.id,
        externalUrl: safeExternalHttpUrl(publishedWooProduct.permalink),
      }, { status: 502 })
    }

    console.error('WooCommerce product sync failed.', { companyId, productId, providerError: providerStatus ?? 'internal' })

    if (companyId && productId) {
      const auth = await requireOwnedCompany(companyId)
      if (!('error' in auth)) {
        await upsertSyncStatus(auth.adminSupabase, companyId, productId, {
          sync_status: 'failed',
          error_message: message,
        }).catch(() => undefined)
      }
    }

    const status = error instanceof WooRequestError
      ? error.status === 429 ? 429 : error.status === 404 ? 409 : error.status >= 500 ? 502 : 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
