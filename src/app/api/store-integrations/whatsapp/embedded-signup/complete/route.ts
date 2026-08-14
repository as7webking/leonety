import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { encryptSecret } from '@/lib/credential-encryption'
import {
  exchangeEmbeddedSignupCode,
  fetchWhatsAppPhoneNumber,
  subscribeWhatsAppApp,
  WHATSAPP_PROVIDER,
  type WhatsAppClientCreationMode,
} from '@/lib/whatsapp-business'

export const runtime = 'nodejs'

function parseClientCreationMode(value: unknown): WhatsAppClientCreationMode {
  return value === 'auto_create_lead' || value === 'never' ? value : 'ask'
}

function readSignupData(body: Record<string, unknown>) {
  const signup = body.signupData && typeof body.signupData === 'object'
    ? body.signupData as Record<string, unknown>
    : {}

  const wabaId = String(
    signup.wabaId ??
    signup.waba_id ??
    signup.whatsapp_business_account_id ??
    body.wabaId ??
    ''
  ).trim()
  const phoneNumberId = String(
    signup.phoneNumberId ??
    signup.phone_number_id ??
    body.phoneNumberId ??
    ''
  ).trim()
  const displayPhoneNumber = String(
    signup.displayPhoneNumber ??
    signup.display_phone_number ??
    body.displayPhoneNumber ??
    ''
  ).trim()

  return { wabaId, phoneNumberId, displayPhoneNumber }
}

function isMissingWhatsAppNumbersTable(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return record.code === '42P01' ||
    record.code === 'PGRST205' ||
    Boolean(record.message?.includes('whatsapp_business_numbers'))
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    const clientCreationMode = parseClientCreationMode(body.clientCreationMode)
    const { wabaId, phoneNumberId, displayPhoneNumber } = readSignupData(body)
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (!code) {
      return NextResponse.json({ error: 'Meta authorization code is required.' }, { status: 400 })
    }
    if (!wabaId || !phoneNumberId) {
      return NextResponse.json({ error: 'WhatsApp Business Account ID and Phone Number ID are required from Embedded Signup.' }, { status: 422 })
    }

    const accessToken = await exchangeEmbeddedSignupCode(code)
    const phoneNumber = await fetchWhatsAppPhoneNumber(phoneNumberId, accessToken)
    const webhookSubscription = await subscribeWhatsAppApp(wabaId, accessToken)
    const now = new Date().toISOString()
    const displayName = phoneNumber.displayPhoneNumber || displayPhoneNumber || phoneNumberId

    const integrationPayload = {
      company_id: companyId,
      provider: WHATSAPP_PROVIDER,
      store_name: 'WhatsApp Business',
      store_url: '',
      external_account_id: wabaId,
      merchant_id: phoneNumberId,
      access_token: '',
      refresh_token: '',
      status: webhookSubscription.ok ? 'connected' : 'error',
      connected_at: now,
      error_message: webhookSubscription.ok ? null : webhookSubscription.error,
      metadata: {
        wabaId,
        primaryPhoneNumberId: phoneNumberId,
        primaryDisplayPhoneNumber: displayName,
        webhookSubscribed: webhookSubscription.ok,
        clientCreationMode,
        supportsMultipleNumbers: true,
      },
      updated_at: now,
    }

    const { data: integration, error: integrationError } = await auth.adminSupabase
      .from('store_integrations')
      .upsert(integrationPayload, { onConflict: 'company_id,provider' })
      .select('id, provider, store_name, external_account_id, merchant_id, status, last_sync_at, connected_at, last_webhook_at, error_message, metadata, updated_at')
      .single()

    if (integrationError) throw integrationError

    const encryptedCredential = encryptSecret(JSON.stringify({
      accessToken,
      tokenType: 'embedded_signup_customer_token',
      connectedAt: now,
    }))
    const { data: numberRow, error: numberError } = await auth.adminSupabase
      .from('whatsapp_business_numbers')
      .upsert({
        company_id: companyId,
        store_integration_id: integration.id,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: displayName,
        verified_name: phoneNumber.verifiedName,
        status: webhookSubscription.ok ? 'connected' : 'error',
        is_default: true,
        encrypted_credentials: encryptedCredential,
        client_creation_mode: clientCreationMode,
        connected_at: now,
        last_error: webhookSubscription.ok ? null : webhookSubscription.error,
        metadata: {
          codeVerificationStatus: phoneNumber.codeVerificationStatus,
          qualityRating: phoneNumber.qualityRating,
          webhookSubscribed: webhookSubscription.ok,
        },
        updated_at: now,
      }, { onConflict: 'company_id,phone_number_id' })
      .select('id, phone_number_id, display_phone_number, verified_name, status, is_default, connected_at, last_webhook_at, last_error, client_creation_mode')
      .single()

    if (numberError) {
      if (isMissingWhatsAppNumbersTable(numberError)) {
        return NextResponse.json({
          error: 'WhatsApp multi-number storage is not installed. Run the additive Supabase migration first.',
          code: 'WHATSAPP_NUMBERS_MIGRATION_REQUIRED',
        }, { status: 500 })
      }
      throw numberError
    }

    return NextResponse.json({
      integration: {
        id: integration.id,
        provider: integration.provider,
        storeName: integration.store_name,
        externalAccountId: integration.external_account_id,
        merchantId: integration.merchant_id,
        status: integration.status,
        lastSyncAt: integration.last_sync_at,
        connectedAt: integration.connected_at,
        lastWebhookAt: integration.last_webhook_at,
        errorMessage: integration.error_message,
        metadata: integration.metadata,
        updatedAt: integration.updated_at,
      },
      number: numberRow,
      webhookSubscribed: webhookSubscription.ok,
    })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
