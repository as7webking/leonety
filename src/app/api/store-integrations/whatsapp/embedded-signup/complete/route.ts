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

    const payload = {
      company_id: companyId,
      provider: WHATSAPP_PROVIDER,
      store_name: displayName,
      store_url: '',
      external_account_id: wabaId,
      merchant_id: phoneNumberId,
      access_token: encryptSecret(JSON.stringify({
        accessToken,
        tokenType: 'embedded_signup_customer_token',
        connectedAt: now,
      })),
      refresh_token: '',
      status: webhookSubscription.ok ? 'connected' : 'error',
      connected_at: now,
      error_message: webhookSubscription.ok ? null : webhookSubscription.error,
      metadata: {
        wabaId,
        phoneNumberId,
        displayPhoneNumber: displayName,
        verifiedName: phoneNumber.verifiedName,
        codeVerificationStatus: phoneNumber.codeVerificationStatus,
        qualityRating: phoneNumber.qualityRating,
        webhookSubscribed: webhookSubscription.ok,
        clientCreationMode,
      },
      updated_at: now,
    }

    const { data, error } = await auth.adminSupabase
      .from('store_integrations')
      .upsert(payload, { onConflict: 'company_id,provider' })
      .select('id, provider, store_name, external_account_id, merchant_id, status, last_sync_at, connected_at, last_webhook_at, error_message, metadata, updated_at')
      .single()

    if (error) throw error

    return NextResponse.json({
      integration: {
        id: data.id,
        provider: data.provider,
        storeName: data.store_name,
        externalAccountId: data.external_account_id,
        merchantId: data.merchant_id,
        status: data.status,
        lastSyncAt: data.last_sync_at,
        connectedAt: data.connected_at,
        lastWebhookAt: data.last_webhook_at,
        errorMessage: data.error_message,
        metadata: data.metadata,
        updatedAt: data.updated_at,
      },
      webhookSubscribed: webhookSubscription.ok,
    })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
