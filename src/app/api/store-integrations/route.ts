import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { encryptSecret, maskSecret as maskStoredSecret } from '@/lib/credential-encryption'
import { isStoreProvider, normalizeStoreUrl, type StoreProvider } from '@/lib/store-integrations'

export const runtime = 'nodejs'

interface StoreIntegrationRow {
  id: string
  provider: StoreProvider
  store_name: string | null
  store_url: string | null
  external_account_id?: string | null
  api_key: string | null
  api_secret: string | null
  merchant_id: string | null
  access_token: string | null
  refresh_token: string | null
  status: 'not_connected' | 'connected' | 'error' | 'disabled'
  last_sync_at: string | null
  connected_at?: string | null
  last_webhook_at?: string | null
  error_message: string | null
  metadata?: Record<string, unknown> | null
  updated_at: string | null
}

function createRequestId() {
  return randomUUID()
}

function safeLogError(context: { requestId: string; route: string; operation: string }, error: unknown) {
  const record = error && typeof error === 'object'
    ? error as { code?: string; message?: string; details?: string }
    : {}

  console.error('[store-integrations]', {
    requestId: context.requestId,
    route: context.route,
    operation: context.operation,
    code: record.code ?? 'unknown',
    message: record.message ?? formatApiError(error),
    details: record.details,
  })
}

function isMissingRelation(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return record.code === '42P01' ||
    record.code === 'PGRST205' ||
    Boolean(record.message?.includes('Could not find the table'))
}

function isSchemaMismatch(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return record.code === '42703' ||
    record.code === 'PGRST204' ||
    Boolean(record.message?.includes('external_account_id'))
}

function publicErrorPayload(error: unknown) {
  if (isMissingRelation(error) || isSchemaMismatch(error)) {
    return {
      code: 'STORE_INTEGRATIONS_SCHEMA_REQUIRED',
      error: 'Store integrations are temporarily unavailable. Please try again.',
    }
  }

  return { error: formatApiError(error) }
}

function responseError(error: unknown, fallbackStatus = 500) {
  const record = error && typeof error === 'object' ? error as { code?: string } : {}
  const status = record.code === '23505'
    ? 409
    : isMissingRelation(error) || isSchemaMismatch(error)
      ? 500
      : fallbackStatus

  return NextResponse.json(publicErrorPayload(error), { status })
}

function secretForStorage(nextValue: string, existingValue?: string | null) {
  if (!nextValue) return existingValue || ''
  return encryptSecret(nextValue)
}

function publicIntegration(row: StoreIntegrationRow) {
  return {
    id: row.id,
    provider: row.provider,
    storeName: row.store_name ?? '',
    storeUrl: row.store_url ?? '',
    externalAccountId: row.external_account_id ?? '',
    apiKeyPreview: maskStoredSecret(row.api_key),
    apiSecretPreview: maskStoredSecret(row.api_secret),
    merchantId: row.merchant_id ?? '',
    accessTokenPreview: maskStoredSecret(row.access_token),
    refreshTokenPreview: maskStoredSecret(row.refresh_token),
    status: row.status,
    lastSyncAt: row.last_sync_at,
    connectedAt: row.connected_at ?? null,
    lastWebhookAt: row.last_webhook_at ?? null,
    errorMessage: row.error_message ?? '',
    metadata: row.metadata ?? null,
    updatedAt: row.updated_at,
  }
}

function publicWhatsAppNumber(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    integrationId: String(row.store_integration_id ?? ''),
    wabaId: String(row.waba_id ?? ''),
    phoneNumberId: String(row.phone_number_id ?? ''),
    displayPhoneNumber: String(row.display_phone_number ?? ''),
    verifiedName: String(row.verified_name ?? ''),
    status: String(row.status ?? ''),
    isDefault: Boolean(row.is_default),
    connectedAt: typeof row.connected_at === 'string' ? row.connected_at : null,
    lastWebhookAt: typeof row.last_webhook_at === 'string' ? row.last_webhook_at : null,
    lastError: String(row.last_error ?? ''),
    clientCreationMode: String(row.client_creation_mode ?? 'ask'),
  }
}

export async function GET(request: Request) {
  const log = { requestId: createRequestId(), route: '/api/store-integrations', operation: 'GET' }

  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const { data, error } = await auth.adminSupabase
      .from('store_integrations')
      .select('id, provider, store_name, store_url, external_account_id, api_key, api_secret, merchant_id, access_token, refresh_token, status, last_sync_at, connected_at, last_webhook_at, error_message, metadata, updated_at')
      .eq('company_id', companyId)
      .order('provider', { ascending: true })

    let rows = (data ?? []) as StoreIntegrationRow[]

    if (error && isSchemaMismatch(error)) {
      const fallback = await auth.adminSupabase
        .from('store_integrations')
        .select('id, provider, store_name, store_url, api_key, api_secret, merchant_id, access_token, refresh_token, status, last_sync_at, error_message, updated_at')
        .eq('company_id', companyId)
        .order('provider', { ascending: true })

      if (fallback.error) throw error
      rows = (fallback.data ?? []) as StoreIntegrationRow[]
    } else if (error && !isMissingRelation(error)) {
      throw error
    }

    const integrations = error && isMissingRelation(error)
      ? []
      : (rows as StoreIntegrationRow[]).map(publicIntegration)

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
          apiKeyPreview: maskStoredSecret(wooConnection.consumer_key),
          apiSecretPreview: maskStoredSecret(wooConnection.consumer_secret),
          merchantId: '',
          accessTokenPreview: '',
          refreshTokenPreview: '',
          status: 'connected',
          lastSyncAt: null,
          connectedAt: wooConnection.updated_at ?? null,
          lastWebhookAt: null,
          errorMessage: '',
          metadata: null,
          updatedAt: wooConnection.updated_at ?? null,
        })
      }
    }

    let whatsappNumbers: ReturnType<typeof publicWhatsAppNumber>[] = []
    const { data: numberRows, error: numberError } = await auth.adminSupabase
      .from('whatsapp_business_numbers')
      .select('id, store_integration_id, waba_id, phone_number_id, display_phone_number, verified_name, status, is_default, connected_at, last_webhook_at, last_error, client_creation_mode')
      .eq('company_id', companyId)
      .order('connected_at', { ascending: false })

    if (!numberError) {
      whatsappNumbers = (numberRows ?? []).map((row) => publicWhatsAppNumber(row as Record<string, unknown>))
    } else if (numberError.code !== '42P01' && numberError.code !== 'PGRST205') {
      throw numberError
    }

    return NextResponse.json({ integrations, whatsappNumbers })
  } catch (error) {
    safeLogError(log, error)
    return responseError(error)
  }
}

export async function POST(request: Request) {
  const log = { requestId: createRequestId(), route: '/api/store-integrations', operation: 'POST' }

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
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : null

    const payload = {
      company_id: companyId,
      provider,
      store_name: typeof body.storeName === 'string' ? body.storeName.trim() : '',
      store_url: typeof body.storeUrl === 'string' && body.storeUrl.trim() ? normalizeStoreUrl(body.storeUrl) : '',
      external_account_id: typeof body.externalAccountId === 'string' ? body.externalAccountId.trim() : '',
      api_key: secretForStorage(apiKey, existingSecrets?.api_key),
      api_secret: secretForStorage(apiSecret, existingSecrets?.api_secret),
      access_token: secretForStorage(accessToken, existingSecrets?.access_token),
      refresh_token: secretForStorage(refreshToken, existingSecrets?.refresh_token),
      merchant_id: merchantId,
      metadata,
      status: 'not_connected',
      error_message: null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await auth.adminSupabase
      .from('store_integrations')
      .upsert(payload, { onConflict: 'company_id,provider' })
      .select('id, provider, store_name, store_url, external_account_id, api_key, api_secret, merchant_id, access_token, refresh_token, status, last_sync_at, connected_at, last_webhook_at, error_message, metadata, updated_at')
      .single()

    if (error) throw error

    return NextResponse.json({ integration: publicIntegration(data as StoreIntegrationRow) })
  } catch (error) {
    safeLogError(log, error)
    return responseError(error)
  }
}

export async function DELETE(request: Request) {
  const log = { requestId: createRequestId(), route: '/api/store-integrations', operation: 'DELETE' }

  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const provider = isStoreProvider(body.provider) ? body.provider : null
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (!provider) {
      return NextResponse.json({ error: 'Integration provider is required.' }, { status: 400 })
    }

    const result = provider === 'whatsapp_business'
      ? await auth.adminSupabase
        .from('store_integrations')
        .update({
          status: 'disabled',
          access_token: '',
          refresh_token: '',
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .eq('provider', provider)
      : await auth.adminSupabase
        .from('store_integrations')
        .delete()
        .eq('company_id', companyId)
        .eq('provider', provider)

    if (result.error) throw result.error

    return NextResponse.json({ ok: true })
  } catch (error) {
    safeLogError(log, error)
    return responseError(error)
  }
}
