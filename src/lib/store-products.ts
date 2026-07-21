import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { normalizeShopifyShop, type StoreProvider } from '@/lib/store-integrations'

export interface StoreIntegrationConnection {
  provider: StoreProvider
  store_url: string | null
  external_account_id: string | null
  merchant_id: string | null
  access_token: string | null
  refresh_token: string | null
  api_key: string | null
  api_secret: string | null
}

export interface ProductForSync {
  id: string
  company_id: string
  name: string
  sku: string | null
  barcode: string | null
  category: string | null
  description: string | null
  selling_price: number | string | null
  currency: string | null
  current_stock: number | string | null
  image_url: string | null
  status: string | null
}

interface ShopifyProductResponse {
  product?: {
    id?: number
    variants?: Array<{ id?: number; inventory_item_id?: number }>
  }
}

interface ShopifyProductImport {
  id?: number | string
  title?: string
  body_html?: string | null
  product_type?: string | null
  status?: string | null
  variants?: Array<{
    id?: number | string
    sku?: string | null
    barcode?: string | null
    price?: string | number | null
    inventory_quantity?: string | number | null
  }>
  images?: Array<{ src?: string | null }>
}

function requireAccessToken(connection: StoreIntegrationConnection) {
  if (!connection.access_token) {
    throw new Error(`${connection.provider} access token is missing. Reconnect the integration.`)
  }

  return connection.access_token
}

function toMoney(value: ProductForSync['selling_price']) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.max(0, number).toFixed(2) : '0.00'
}

function toStock(value: ProductForSync['current_stock']) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

export async function getStoreIntegration(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  provider: StoreProvider
) {
  const { data, error } = await adminSupabase
    .from('store_integrations')
    .select('provider, store_url, external_account_id, merchant_id, access_token, refresh_token, api_key, api_secret')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(`${provider} integration is not connected.`)

  return data as StoreIntegrationConnection
}

export async function fetchProductsForSync(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  productIds: string[]
) {
  let query = adminSupabase
    .from('products')
    .select('id, company_id, name, sku, barcode, category, description, selling_price, currency, current_stock, image_url, status')
    .eq('company_id', companyId)
    .neq('status', 'archived')

  if (productIds.length > 0) {
    query = query.in('id', productIds)
  }

  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw error

  return (data ?? []) as ProductForSync[]
}

export async function upsertProductSync(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  productId: string,
  channel: string,
  payload: {
    externalProductId?: string | number | null
    externalVariantId?: string | number | null
    syncStatus: 'synced' | 'failed'
    errorMessage?: string | null
  }
) {
  const { error } = await adminSupabase
    .from('product_syncs')
    .upsert({
      company_id: companyId,
      product_id: productId,
      channel,
      external_product_id: payload.externalProductId ? String(payload.externalProductId) : null,
      external_variant_id: payload.externalVariantId ? String(payload.externalVariantId) : null,
      sync_status: payload.syncStatus,
      error_message: payload.errorMessage ?? null,
      last_synced_at: payload.syncStatus === 'synced' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,product_id,channel' })

  if (error) throw error
}

export async function getExistingProductSync(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  productId: string,
  channel: StoreProvider
) {
  const { data, error } = await adminSupabase
    .from('product_syncs')
    .select('external_product_id, external_variant_id')
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .eq('channel', channel)
    .maybeSingle()

  if (error) throw error

  return {
    externalProductId: data?.external_product_id ?? null,
    externalVariantId: data?.external_variant_id ?? null,
  }
}

export async function syncProductToShopify(connection: StoreIntegrationConnection, product: ProductForSync, externalProductId?: string | null) {
  const token = requireAccessToken(connection)
  const shop = normalizeShopifyShop(connection.external_account_id || connection.store_url || '')
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10'
  const endpoint = externalProductId
    ? `https://${shop}/admin/api/${apiVersion}/products/${encodeURIComponent(externalProductId)}.json`
    : `https://${shop}/admin/api/${apiVersion}/products.json`
  const response = await fetch(endpoint, {
    method: externalProductId ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      product: {
        title: product.name,
        body_html: product.description ?? '',
        vendor: 'Leonety',
        product_type: product.category ?? '',
        status: product.status === 'inactive' ? 'draft' : 'active',
        tags: [product.category, product.barcode].filter(Boolean).join(','),
        images: product.image_url ? [{ src: product.image_url }] : [],
        variants: [{
          sku: product.sku ?? undefined,
          price: toMoney(product.selling_price),
          inventory_management: 'shopify',
          inventory_quantity: toStock(product.current_stock),
          barcode: product.barcode ?? undefined,
        }],
      },
    }),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({})) as ShopifyProductResponse & { errors?: unknown }
  if (!response.ok) {
    throw new Error(typeof payload.errors === 'string' ? payload.errors : JSON.stringify(payload.errors ?? payload))
  }

  return {
    externalProductId: payload.product?.id ?? null,
    externalVariantId: payload.product?.variants?.[0]?.id ?? null,
  }
}

export async function syncProductToGoogleMerchant(connection: StoreIntegrationConnection, product: ProductForSync, externalProductId?: string | null) {
  const token = requireAccessToken(connection)
  const merchantId = connection.merchant_id
  if (!merchantId) {
    throw new Error('Google Merchant ID is missing.')
  }

  const productId = product.sku || product.id
  const endpoint = externalProductId
    ? `https://shoppingcontent.googleapis.com/content/v2.1/${encodeURIComponent(merchantId)}/products/${encodeURIComponent(externalProductId)}`
    : `https://shoppingcontent.googleapis.com/content/v2.1/${encodeURIComponent(merchantId)}/products`
  const response = await fetch(endpoint, {
    method: externalProductId ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      offerId: productId,
      title: product.name,
      description: product.description ?? product.name,
      link: connection.store_url || '',
      imageLink: product.image_url || undefined,
      contentLanguage: 'en',
      targetCountry: 'DE',
      channel: 'online',
      availability: toStock(product.current_stock) > 0 ? 'in stock' : 'out of stock',
      price: {
        value: toMoney(product.selling_price),
        currency: product.currency || 'EUR',
      },
      brand: 'Leonety',
      gtin: product.barcode || undefined,
      mpn: product.sku || undefined,
      googleProductCategory: product.category || undefined,
    }),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error?.message || JSON.stringify(payload.error ?? payload))
  }

  return {
    externalProductId: payload.id ?? productId,
    externalVariantId: null,
  }
}

export async function importShopifyProducts(connection: StoreIntegrationConnection) {
  const token = requireAccessToken(connection)
  const shop = normalizeShopifyShop(connection.external_account_id || connection.store_url || '')
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10'
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/products.json?limit=250`, {
    headers: { 'X-Shopify-Access-Token': token },
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({})) as { products?: ShopifyProductImport[]; errors?: unknown }
  if (!response.ok) {
    throw new Error(typeof payload.errors === 'string' ? payload.errors : JSON.stringify(payload.errors ?? payload))
  }

  return Array.isArray(payload.products) ? payload.products : []
}

export function mapShopifyProductToLeonety(companyId: string, product: ShopifyProductImport) {
  const variant = Array.isArray(product.variants) ? product.variants[0] : null
  const image = Array.isArray(product.images) ? product.images[0] : null

  return {
    company_id: companyId,
    name: product.title || `Shopify #${product.id}`,
    sku: variant?.sku || null,
    barcode: variant?.barcode || null,
    category: product.product_type || null,
    description: product.body_html || null,
    selling_price: Number(variant?.price ?? 0),
    current_stock: Math.max(0, Number(variant?.inventory_quantity ?? 0)),
    image_url: image?.src || null,
    status: product.status === 'draft' ? 'inactive' : 'active',
    updated_at: new Date().toISOString(),
  }
}
