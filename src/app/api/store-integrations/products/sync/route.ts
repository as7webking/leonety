import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { isStoreProvider, type StoreProvider } from '@/lib/store-integrations'
import {
  fetchProductsForSync,
  getExistingProductSync,
  getStoreIntegration,
  syncProductToGoogleMerchant,
  syncProductToShopify,
  upsertProductSync,
} from '@/lib/store-products'

export const runtime = 'nodejs'

async function syncOne(
  provider: StoreProvider,
  connection: Awaited<ReturnType<typeof getStoreIntegration>>,
  product: Awaited<ReturnType<typeof fetchProductsForSync>>[number],
  externalProductId?: string | null
) {
  if (provider === 'shopify') {
    return syncProductToShopify(connection, product, externalProductId)
  }

  if (provider === 'google_merchant') {
    return syncProductToGoogleMerchant(connection, product, externalProductId)
  }

  throw new Error(`${provider} direct product sync is not implemented yet.`)
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const provider = isStoreProvider(body.provider) ? body.provider : null
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id: unknown): id is string => typeof id === 'string')
      : typeof body.productId === 'string'
        ? [body.productId]
        : []
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (!provider) {
      return NextResponse.json({ error: 'Integration provider is required.' }, { status: 400 })
    }

    if (!['shopify', 'google_merchant'].includes(provider)) {
      return NextResponse.json({ error: `${provider} direct sync is not implemented yet.` }, { status: 400 })
    }

    const connection = await getStoreIntegration(auth.adminSupabase, companyId, provider)
    const products = await fetchProductsForSync(auth.adminSupabase, companyId, productIds)
    let synced = 0
    const errors: string[] = []

    for (const product of products) {
      try {
        const existingSync = await getExistingProductSync(auth.adminSupabase, companyId, product.id, provider)
        const result = await syncOne(provider, connection, product, existingSync.externalProductId)
        await upsertProductSync(auth.adminSupabase, companyId, product.id, provider, {
          externalProductId: result.externalProductId ?? existingSync.externalProductId,
          externalVariantId: result.externalVariantId ?? existingSync.externalVariantId,
          syncStatus: 'synced',
        })
        synced += 1
      } catch (error) {
        const message = formatApiError(error)
        errors.push(`${product.name}: ${message}`)
        await upsertProductSync(auth.adminSupabase, companyId, product.id, provider, {
          syncStatus: 'failed',
          errorMessage: message,
        })
      }
    }

    const { error: integrationError } = await auth.adminSupabase
      .from('store_integrations')
      .update({
        last_sync_at: synced > 0 ? new Date().toISOString() : null,
        status: errors.length > 0 && synced === 0 ? 'error' : 'connected',
        error_message: errors[0] ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('provider', provider)

    if (integrationError) throw integrationError

    return NextResponse.json({ synced, failed: errors.length, errors })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
