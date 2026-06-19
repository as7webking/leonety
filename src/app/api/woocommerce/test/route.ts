import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { normalizeWooStoreUrl, wooRequest, type WooConnection } from '@/lib/woocommerce'

export const runtime = 'nodejs'

interface ConnectionRow {
  store_url: string
  consumer_key: string
  consumer_secret: string
  active: boolean
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const storeUrl = typeof body.storeUrl === 'string' ? body.storeUrl : ''
    const consumerKey = typeof body.consumerKey === 'string' ? body.consumerKey.trim() : ''
    const consumerSecret = typeof body.consumerSecret === 'string' ? body.consumerSecret.trim() : ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    let connection: WooConnection | null = null

    if (storeUrl && consumerKey && consumerSecret) {
      connection = {
        store_url: normalizeWooStoreUrl(storeUrl),
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }
    } else {
      const { data, error } = await auth.adminSupabase
        .from('woocommerce_connections')
        .select('store_url, consumer_key, consumer_secret, active')
        .eq('company_id', companyId)
        .maybeSingle()

      if (error) throw error
      if (data?.active) {
        connection = data as ConnectionRow
      }
    }

    if (!connection) {
      return NextResponse.json({ error: 'WooCommerce connection is not configured.' }, { status: 400 })
    }

    await wooRequest(connection, '/products?per_page=1')

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
