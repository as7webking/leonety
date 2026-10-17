import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { decryptSecret } from '@/lib/credential-encryption'
import { wooRequest, type WooConnection } from '@/lib/woocommerce'

export const runtime = 'nodejs'

interface WooConnectionRow extends WooConnection {
  active: boolean
}

interface WooCategory {
  id: number
  name: string
}

export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const { data, error } = await auth.adminSupabase
      .from('woocommerce_connections')
      .select('store_url, consumer_key, consumer_secret, active')
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) throw error
    if (!data?.active) return NextResponse.json({ error: 'WooCommerce connection is not configured.' }, { status: 409 })

    const stored = data as WooConnectionRow
    const connection = {
      ...stored,
      consumer_key: decryptSecret(stored.consumer_key),
      consumer_secret: decryptSecret(stored.consumer_secret),
    }
    const categories: WooCategory[] = []

    for (let page = 1; page <= 20; page += 1) {
      const batch = await wooRequest<WooCategory[]>(connection, `/products/categories?per_page=100&page=${page}`)
      categories.push(...batch.map(({ id, name }) => ({ id, name })))
      if (batch.length < 100) break
    }

    return NextResponse.json({ categories })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 502 })
  }
}
