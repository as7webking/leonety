import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { buildCsv } from '@/lib/product-csv'

export const runtime = 'nodejs'

const requestSchema = z.object({
  companyId: z.string().uuid(),
  format: z.enum(['leonety', 'woocommerce', 'shopify', 'google_basic']),
  scope: z.enum(['selected', 'visible', 'all']),
  productIds: z.array(z.string().uuid()).max(5000).optional().default([]),
})

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

function productRows(format: string, products: ProductRow[]) {
  if (format === 'woocommerce') return [
    ['Type', 'SKU', 'Name', 'Published', 'Visibility in catalog', 'Short description', 'Description', 'Regular price', 'Categories', 'Images', 'Stock', 'Meta: barcode'],
    ...products.map((product) => [
      'simple', product.sku, product.name, product.status === 'active' ? 1 : 0, 'visible', '', product.description,
      product.selling_price, product.category, product.image_url, product.current_stock, product.barcode,
    ]),
  ]

  if (format === 'shopify') return [
    ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Image Src', 'Status'],
    ...products.map((product) => [
      product.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      product.name, product.description, '', product.category, product.category, product.barcode, product.status === 'active' ? 'TRUE' : 'FALSE',
      'Title', 'Default Title', product.sku, product.current_stock, product.selling_price, product.image_url,
      product.status === 'archived' ? 'archived' : 'active',
    ]),
  ]

  if (format === 'google_basic') return [
    ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'gtin', 'mpn', 'product_type'],
    ...products.map((product) => [
      product.sku || product.id, product.name, product.description, '', product.image_url,
      Number(product.current_stock ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
      product.selling_price === null ? '' : `${Number(product.selling_price).toFixed(2)} ${product.currency ?? 'EUR'}`,
      product.barcode, product.sku, product.category,
    ]),
  ]

  return [
    ['name', 'description', 'sku', 'barcode', 'category', 'price', 'currency', 'stock', 'image_url', 'status'],
    ...products.map((product) => [
      product.name, product.description, product.sku, product.barcode, product.category, product.selling_price,
      product.currency, product.current_stock, product.image_url, product.status,
    ]),
  ]
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  if (parsed.data.scope !== 'all' && parsed.data.productIds.length === 0) {
    return NextResponse.json({ error: 'nothing_selected' }, { status: 400 })
  }

  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const selection = 'id, name, sku, barcode, category, description, selling_price, currency, current_stock, image_url, status'
  let products: ProductRow[] = []

  if (parsed.data.scope === 'all') {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await auth.adminSupabase
        .from('products')
        .select(selection)
        .eq('company_id', parsed.data.companyId)
        .order('name', { ascending: true })
        .range(from, from + 999)
      if (error) return NextResponse.json({ error: 'export_failed' }, { status: 500 })
      const page = (data ?? []) as ProductRow[]
      products = products.concat(page)
      if (page.length < 1000) break
    }
  } else {
    const { data, error } = await auth.adminSupabase
      .from('products')
      .select(selection)
      .eq('company_id', parsed.data.companyId)
      .in('id', parsed.data.productIds)
      .order('name', { ascending: true })
    if (error) return NextResponse.json({ error: 'export_failed' }, { status: 500 })
    products = (data ?? []) as ProductRow[]
  }

  const filename = `leonety-products-${parsed.data.format}-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(buildCsv(productRows(parsed.data.format, products)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
