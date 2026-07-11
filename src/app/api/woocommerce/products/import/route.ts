import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { wooRequest, type WooConnection } from '@/lib/woocommerce'

export const runtime = 'nodejs'

interface WooConnectionRow extends WooConnection {
  active: boolean
}

interface WooProductImportRow {
  id: number
  name: string
  sku?: string
  description?: string
  short_description?: string
  regular_price?: string
  price?: string
  stock_quantity?: number | null
  images?: Array<{ src?: string }>
  categories?: Array<{ id: number; name: string }>
}

interface ProductSyncRow {
  product_id: string
  external_product_id: string | null
}

async function fetchAllWooProducts(connection: WooConnectionRow) {
  const products: WooProductImportRow[] = []

  for (let page = 1; page <= 50; page += 1) {
    const nextPage = await wooRequest<WooProductImportRow[]>(
      connection,
      `/products?per_page=100&page=${page}&status=any`
    )

    products.push(...nextPage)

    if (nextPage.length < 100) break
  }

  return products
}

async function createCategoryIfPossible(
  adminSupabase: { from: (table: string) => any },
  companyId: string,
  name: string | null
) {
  if (!name) return

  const { error } = await adminSupabase
    .from('product_categories')
    .insert({
      company_id: companyId,
      name,
      slug: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'category',
    })

  if (error && error.code !== '23505') {
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const { data: connection, error: connectionError } = await auth.adminSupabase
      .from('woocommerce_connections')
      .select('store_url, consumer_key, consumer_secret, active')
      .eq('company_id', companyId)
      .maybeSingle()

    if (connectionError) throw connectionError
    if (!connection?.active) {
      return NextResponse.json({ error: 'WooCommerce connection is not configured.' }, { status: 400 })
    }

    const products = await fetchAllWooProducts(connection as WooConnectionRow)
    let imported = 0

    for (const wooProduct of products) {
      const categoryName = wooProduct.categories?.[0]?.name ?? null
      await createCategoryIfPossible(auth.adminSupabase, companyId, categoryName).catch(() => undefined)

      const { data: syncRow } = await auth.adminSupabase
        .from('product_syncs')
        .select('product_id, external_product_id')
        .eq('company_id', companyId)
        .eq('channel', 'woocommerce')
        .eq('external_product_id', String(wooProduct.id))
        .maybeSingle<ProductSyncRow>()

      const sku = wooProduct.sku?.trim() || null
      const existingProductQuery = syncRow?.product_id
        ? auth.adminSupabase.from('products').select('id').eq('company_id', companyId).eq('id', syncRow.product_id).maybeSingle()
        : sku
          ? auth.adminSupabase.from('products').select('id').eq('company_id', companyId).eq('sku', sku).maybeSingle()
          : Promise.resolve({ data: null, error: null })

      const { data: existingProduct, error: existingError } = await existingProductQuery
      if (existingError) throw existingError

      const payload = {
        company_id: companyId,
        name: wooProduct.name || `WooCommerce #${wooProduct.id}`,
        sku,
        category: categoryName,
        description: wooProduct.description || wooProduct.short_description || null,
        selling_price: Number(wooProduct.regular_price || wooProduct.price || 0),
        current_stock: Math.max(0, Number(wooProduct.stock_quantity ?? 0)),
        image_url: wooProduct.images?.[0]?.src ?? null,
        woo_product_type: 'simple',
        status: 'active',
        updated_at: new Date().toISOString(),
      }

      const productResult = existingProduct?.id
        ? await auth.adminSupabase.from('products').update(payload).eq('id', existingProduct.id).select('id').single()
        : await auth.adminSupabase.from('products').insert(payload).select('id').single()

      if (productResult.error) throw productResult.error

      await auth.adminSupabase
        .from('product_syncs')
        .upsert({
          company_id: companyId,
          product_id: productResult.data.id,
          channel: 'woocommerce',
          external_product_id: String(wooProduct.id),
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,product_id,channel' })

      imported += 1
    }

    return NextResponse.json({ imported })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
