import 'server-only'
import { decryptSecret } from '@/lib/credential-encryption'
import { getStoreIntegration, importShopifyProducts, mapShopifyProductToLeonety } from '@/lib/store-products'
import { wooRequest, type WooConnection } from '@/lib/woocommerce'
import type { ExternalChannelProduct, SupportedComparisonProvider } from '@/lib/product-channel-comparison'
import type { createSupabaseAdminClient } from '@/lib/supabase-admin'

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

interface WooConnectionRow extends WooConnection {
  active: boolean
}

interface WooProductRow {
  id: number
  name?: string
  sku?: string | null
  description?: string | null
  short_description?: string | null
  regular_price?: string | null
  price?: string | null
  stock_quantity?: number | null
  status?: string | null
  categories?: Array<{ name?: string | null }>
  images?: Array<{ src?: string | null }>
  meta_data?: Array<{ key?: string; value?: unknown }>
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function htmlToText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchWooProducts(adminSupabase: AdminClient, companyId: string) {
  const { data, error } = await adminSupabase
    .from('woocommerce_connections')
    .select('store_url, consumer_key, consumer_secret, active')
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  if (!data?.active) throw new Error('provider_not_connected')
  const saved = data as WooConnectionRow
  const connection = { ...saved, consumer_key: decryptSecret(saved.consumer_key), consumer_secret: decryptSecret(saved.consumer_secret) }
  const products: WooProductRow[] = []
  for (let page = 1; page <= 50; page += 1) {
    const next = await wooRequest<WooProductRow[]>(connection, `/products?per_page=100&page=${page}&status=any`)
    products.push(...next)
    if (next.length < 100) break
  }
  return products.map((product): ExternalChannelProduct => {
    const barcodeMeta = product.meta_data?.find((entry) => entry.key === 'barcode')
    const barcode = typeof barcodeMeta?.value === 'string' ? barcodeMeta.value.trim() : ''
    const price = finiteNumber(product.regular_price || product.price)
    const stock = finiteNumber(product.stock_quantity)
    return {
      id: String(product.id),
      name: product.name?.trim() || `WooCommerce #${product.id}`,
      sku: product.sku?.trim() || null,
      barcode: barcode || null,
      price,
      stock,
      category: product.categories?.[0]?.name?.trim() || null,
      image: product.images?.[0]?.src?.trim() || null,
      description: htmlToText(product.description || product.short_description) || null,
      status: product.status === 'draft' || product.status === 'private' ? 'inactive' : 'active',
      supportedFields: [
        'name',
        'sku',
        ...(barcodeMeta ? ['barcode' as const] : []),
        ...(price !== null ? ['price' as const] : []),
        ...(stock !== null ? ['stock' as const] : []),
        'category',
        'image',
      ],
    }
  })
}

async function fetchShopifyProducts(adminSupabase: AdminClient, companyId: string) {
  const connection = await getStoreIntegration(adminSupabase, companyId, 'shopify')
  const products = await importShopifyProducts(connection)
  return products.map((product): ExternalChannelProduct => {
    const mapped = mapShopifyProductToLeonety(companyId, product)
    const variants = Array.isArray(product.variants) ? product.variants : []
    const scalarVariant = variants.length === 1 ? variants[0] : null
    const price = scalarVariant ? finiteNumber(scalarVariant.price) : null
    const stock = scalarVariant ? finiteNumber(scalarVariant.inventory_quantity) : null
    return {
      id: String(product.id),
      name: mapped.name,
      sku: scalarVariant?.sku?.trim() || null,
      barcode: scalarVariant?.barcode?.trim() || null,
      price,
      stock,
      category: mapped.category,
      image: mapped.image_url,
      description: mapped.description,
      status: mapped.status === 'inactive' ? 'inactive' : 'active',
      supportedFields: [
        'name',
        ...(scalarVariant ? ['sku' as const, 'barcode' as const] : []),
        ...(price !== null ? ['price' as const] : []),
        ...(stock !== null ? ['stock' as const] : []),
        'category',
        'image',
      ],
    }
  })
}

export function fetchExternalChannelProducts(adminSupabase: AdminClient, companyId: string, provider: SupportedComparisonProvider) {
  return provider === 'woocommerce'
    ? fetchWooProducts(adminSupabase, companyId)
    : fetchShopifyProducts(adminSupabase, companyId)
}
