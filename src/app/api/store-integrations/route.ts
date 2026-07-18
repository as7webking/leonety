import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { isStoreProvider, normalizeStoreUrl, type StoreProvider } from '@/lib/store-integrations'

export const runtime = 'nodejs'

interface StoreIntegrationRow {
  id: string
  provider: StoreProvider
  store_name: string | null
  store_url: string | null
  external_account_id: string | null
  api_key: string | null
  api_secret: string | null
  merchant_id: string | null
  access_token: string | null
  refresh_token: string | null
  status: 'not_connected' | 'connected' | 'error'
  last_sync_at: string | null
  error_message: string | null
  updated_at: string | null
}

function maskSecret(value?: string | null) {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

function publicIntegration(row: StoreIntegrationRow) {
  return {
    id: row.id,
    provider: row.provider,
    storeName: row.store_name ?? '',
    storeUrl: row.store_url ?? '',
    externalAccountId: row.external_account_id ?? '',
    apiKeyPreview: maskSecret(row.api_key),
    apiSecretPreview: maskSecret(row.api_secret),
    merchantId: row.merchant_id ?? '',
    accessTokenPreview: maskSecret(row.access_token),
    refreshTokenPreview: maskSecret(row.refresh_token),
    status: row.status,
    lastSyncAt: row.last_sync_at,
    errorMessage: row.error_message ?? '',
    updatedAt: row.updated_at,
  }
}

export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const { data, error } = await auth.adminSupabase
      .from('store_integrations')
      .select('id, provider, store_name, store_url, external_account_id, api_key, api_secret, merchant_id, access_token, refresh_token, status, last_sync_at, error_message, updated_at')
      .eq('company_id', companyId)
      .order('provider', { ascending: true })

    if (error) throw error

    const integrations = ((data ?? []) as StoreIntegrationRow[]).map(publicIntegration)

    const hasWooStoreIntegration = integrations.some((integration) => integration.provider === 'woocommerce')
    if (!hasWooStoreIntegration) {
      const { data: wooConnection, error: wooError } = await auth.adminSupabase
        .from('woocommerce_connections')
        .select('store_url, consumer_key, consumer_secret, active, updated_at')
        .eq('company_id', companyId)
        .maybeSingle()

      if (wooError && wooError.code !== '42P01') throw wooError

      if (wooConnection?.active) {
        integrations.push({
          id: 'woocommerce-legacy',
          provider: 'woocommerce',
          storeName: 'WooCommerce',
          storeUrl: wooConnection.store_url ?? '',
          externalAccountId: '',
          apiKeyPreview: maskSecret(wooConnection.consumer_key),
          apiSecretPreview: maskSecret(wooConnection.consumer_secret),
          merchantId: '',
          accessTokenPreview: '',
          refreshTokenPreview: '',
          status: 'connected',
          lastSyncAt: null,
          errorMessage: '',
          updatedAt: wooConnection.updated_at ?? null,
        })
      }
    }

    return NextResponse.json({ integrations })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const provider = isStoreProvider(body.provider) ? body.provider : null
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (!provider) {
      return NextResponse.json({ error: 'Integration provider is required.' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await auth.adminSupabase
      .from('store_integrations')
      .select('id, api_key, api_secret, access_token, refresh_token')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .maybeSingle()

    if (existingError) throw existingError

    const existingSecrets = existing as Pick<StoreIntegrationRow, 'api_key' | 'api_secret' | 'access_token' | 'refresh_token'> | null
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim() : ''
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : ''
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : ''
    const merchantId = typeof body.merchantId === 'string' ? body.merchantId.trim() : ''

    const payload = {
      company_id: companyId,
      provider,
      store_name: typeof body.storeName === 'string' ? body.storeName.trim() : '',
      store_url: typeof body.storeUrl === 'string' && body.storeUrl.trim() ? normalizeStoreUrl(body.storeUrl) : '',
      external_account_id: typeof body.externalAccountId === 'string' ? body.externalAccountId.trim() : '',
      api_key: apiKey || existingSecrets?.api_key || '',
      api_secret: apiSecret || existingSecrets?.api_secret || '',
      access_token: accessToken || existingSecrets?.access_token || '',
      refresh_token: refreshToken || existingSecrets?.refresh_token || '',
      merchant_id: merchantId,
      status: 'connected',
      error_message: null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await auth.adminSupabase
      .from('store_integrations')
      .upsert(payload, { onConflict: 'company_id,provider' })
      .select('id, provider, store_name, store_url, external_account_id, api_key, api_secret, merchant_id, access_token, refresh_token, status, last_sync_at, error_message, updated_at')
      .single()

    if (error) throw error

    return NextResponse.json({ integration: publicIntegration(data as StoreIntegrationRow) })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const provider = isStoreProvider(body.provider) ? body.provider : null
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (!provider) {
      return NextResponse.json({ error: 'Integration provider is required.' }, { status: 400 })
    }

    const { error } = await auth.adminSupabase
      .from('store_integrations')
      .delete()
      .eq('company_id', companyId)
      .eq('provider', provider)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
