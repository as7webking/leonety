import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { isStoreProvider } from '@/lib/store-integrations'

export const runtime = 'nodejs'

interface ProductRow {
  id: string
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

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function buildCsv(provider: string, products: ProductRow[]) {
  if (provider === 'shopify') {
    const rows = [
      ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Variant SKU', 'Variant Price', 'Variant Inventory Qty', 'Image Src', 'Status'],
      ...products.map((product) => [
        product.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        product.name,
        product.description ?? '',
        'Leonety',
        product.category ?? '',
        product.category ?? '',
        product.barcode ?? '',
        product.sku ?? '',
        product.selling_price ?? '',
        product.current_stock ?? '',
        product.image_url ?? '',
        product.status ?? 'active',
      ]),
    ]
    return rows.map((row) => row.map(csvCell).join(',')).join('\n')
  }

  if (provider === 'google_merchant') {
    const rows = [
      ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'brand', 'gtin', 'mpn', 'google_product_category'],
      ...products.map((product) => [
        product.sku || product.id,
        product.name,
        product.description ?? '',
        '',
        product.image_url ?? '',
        Number(product.current_stock ?? 0) > 0 ? 'in stock' : 'out of stock',
        `${Number(product.selling_price ?? 0).toFixed(2)} ${product.currency ?? 'EUR'}`,
        'Leonety',
        product.barcode ?? '',
        product.sku ?? '',
        product.category ?? '',
      ]),
    ]
    return rows.map((row) => row.map(csvCell).join(',')).join('\n')
  }

  const rows = [
    ['name', 'description', 'sku', 'barcode', 'category', 'price', 'currency', 'stock', 'image_url', 'status'],
    ...products.map((product) => [
      product.name,
      product.description ?? '',
      product.sku ?? '',
      product.barcode ?? '',
      product.category ?? '',
      product.selling_price ?? '',
      product.currency ?? '',
      product.current_stock ?? '',
      product.image_url ?? '',
      product.status ?? '',
    ]),
  ]

  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const provider = isStoreProvider(body.provider) ? body.provider : 'woocommerce'
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id: unknown): id is string => typeof id === 'string')
      : []
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    let query = auth.adminSupabase
      .from('products')
      .select('id, name, sku, barcode, category, description, selling_price, currency, current_stock, image_url, status')
      .eq('company_id', companyId)
      .order('name', { ascending: true })

    if (productIds.length > 0) {
      query = query.in('id', productIds)
    }

    const { data, error } = await query
    if (error) throw error

    const csv = buildCsv(provider, (data ?? []) as ProductRow[])
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leonety-${provider}-products.csv"`,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
