import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { isStoreProvider } from '@/lib/store-integrations'
import {
  getStoreIntegration,
  importShopifyProducts,
  mapShopifyProductToLeonety,
  upsertProductSync,
} from '@/lib/store-products'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const provider = isStoreProvider(body.provider) ? body.provider : null
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (provider !== 'shopify') {
      return NextResponse.json({ error: 'Product import is currently implemented for Shopify only.' }, { status: 400 })
    }

    const connection = await getStoreIntegration(auth.adminSupabase, companyId, provider)
    const shopifyProducts = await importShopifyProducts(connection)
    let imported = 0

    for (const shopifyProduct of shopifyProducts) {
      const mapped = mapShopifyProductToLeonety(companyId, shopifyProduct)
      const sku = mapped.sku
      const existingQuery = sku
        ? auth.adminSupabase.from('products').select('id').eq('company_id', companyId).eq('sku', sku).maybeSingle()
        : Promise.resolve({ data: null, error: null })
      const { data: existing, error: existingError } = await existingQuery
      if (existingError) throw existingError

      const result = existing?.id
        ? await auth.adminSupabase.from('products').update(mapped).eq('id', existing.id).eq('company_id', companyId).select('id').single()
        : await auth.adminSupabase.from('products').insert(mapped).select('id').single()

      if (result.error) throw result.error

      await upsertProductSync(auth.adminSupabase, companyId, result.data.id, provider, {
        externalProductId: shopifyProduct.id,
        externalVariantId: Array.isArray(shopifyProduct.variants) ? shopifyProduct.variants[0]?.id : null,
        syncStatus: 'synced',
      })

      imported += 1
    }

    const { error: integrationError } = await auth.adminSupabase
      .from('store_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        status: 'connected',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('provider', provider)

    if (integrationError) throw integrationError

    return NextResponse.json({ imported })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
