import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { wooRequest, type WooConnection } from '@/lib/woocommerce'

export const runtime = 'nodejs'

interface WooConnectionRow extends WooConnection {
  active: boolean
}

interface WooProductPreviewRow {
  id: number
  name: string
  sku?: string
  price?: string
  stock_quantity?: number | null
  categories?: Array<{ id: number; name: string }>
  images?: Array<{ src?: string }>
}

async function fetchAllPreviewProducts(connection: WooConnectionRow) {
  const products: WooProductPreviewRow[] = []

  for (let page = 1; page <= 50; page += 1) {
    const nextPage = await wooRequest<WooProductPreviewRow[]>(
      connection,
      `/products?per_page=100&page=${page}&status=any`
    )

    products.push(...nextPage)
    if (nextPage.length < 100) break
  }

  return products
}

export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
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

    const products = await fetchAllPreviewProducts(connection as WooConnectionRow)
    const categories = Array.from(new Set(products.flatMap((product) => product.categories?.map((category) => category.name) ?? []))).sort()

    return NextResponse.json({
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku ?? '',
        price: product.price ?? '',
        stock: product.stock_quantity ?? 0,
        category: product.categories?.[0]?.name ?? '',
        image: product.images?.[0]?.src ?? '',
      })),
      categories,
    })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
