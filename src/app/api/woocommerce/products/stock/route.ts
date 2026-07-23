import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { decryptSecret } from '@/lib/credential-encryption'
import { toWooStock, wooRequest, type WooConnection } from '@/lib/woocommerce'

export const runtime = 'nodejs'

interface ConnectionRow extends WooConnection {
  active: boolean
  inventory_sync_enabled: boolean
}

interface ProductRow {
  id: string
  current_stock: number | string
  woo_product_type?: 'simple' | 'variable' | null
}

interface SyncRow {
  external_product_id: string | null
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const productId = typeof body.productId === 'string' ? body.productId : ''

    if (!productId) {
      return NextResponse.json({ skipped: true, reason: 'Product is required.' }, { status: 400 })
    }

    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const [{ data: connection, error: connectionError }, { data: product, error: productError }, { data: syncRow, error: syncError }] = await Promise.all([
      auth.adminSupabase
        .from('woocommerce_connections')
        .select('store_url, consumer_key, consumer_secret, active, inventory_sync_enabled')
        .eq('company_id', companyId)
        .maybeSingle(),
      auth.adminSupabase
        .from('products')
        .select('id, current_stock, woo_product_type')
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

    const wooConnection = connection as ConnectionRow | null
    const wooProductId = Number((syncRow as SyncRow | null)?.external_product_id ?? 0) || null
    if (!wooConnection?.active || !wooConnection.inventory_sync_enabled || !wooProductId) {
      return NextResponse.json({ skipped: true })
    }

    const productRow = product as ProductRow
    if (productRow.woo_product_type === 'variable') {
      return NextResponse.json({ skipped: true, reason: 'Variable product stock is managed per variation.' })
    }

    await wooRequest({
      ...wooConnection,
      consumer_key: decryptSecret(wooConnection.consumer_key),
      consumer_secret: decryptSecret(wooConnection.consumer_secret),
    }, `/products/${wooProductId}`, {
      method: 'PUT',
      body: {
        manage_stock: true,
        stock_quantity: toWooStock(Number(productRow.current_stock)),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = formatApiError(error)
    console.error('WooCommerce stock sync failed:', { message })
    const status = message.includes('product_syncs') || message.includes('woocommerce_connections') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
