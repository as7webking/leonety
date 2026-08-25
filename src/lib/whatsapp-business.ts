import 'server-only'
import crypto from 'node:crypto'
import { getSiteUrl } from '@/lib/site-url'

export const WHATSAPP_PROVIDER = 'whatsapp_business' as const
export const DEFAULT_GRAPH_API_VERSION = 'v25.0'

export type WhatsAppClientCreationMode = 'ask' | 'auto_create_lead' | 'never'

export interface WhatsAppSignupData {
  wabaId: string
  phoneNumberId: string
  displayPhoneNumber?: string
}

interface GraphTokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: { message?: string; type?: string; code?: number }
}

interface GraphPhoneNumberResponse {
  id?: string
  display_phone_number?: string
  verified_name?: string
  code_verification_status?: string
  quality_rating?: string
  error?: { message?: string; type?: string; code?: number }
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required server-side for WhatsApp Business integration.`)
  }
  return value
}

export function getWhatsAppPlatformConfig() {
  const graphVersion = process.env.GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_API_VERSION

  return {
    appId: getRequiredEnv('META_APP_ID'),
    configId: getRequiredEnv('META_WHATSAPP_CONFIG_ID'),
    graphVersion,
  }
}

export function getWhatsAppWebhookUrl() {
  return new URL('/api/webhooks/whatsapp', getSiteUrl()).toString()
}

export function validateMetaSignature(rawBody: string, signature: string | null) {
  const appSecret = getRequiredEnv('META_APP_SECRET')
  if (!signature?.startsWith('sha256=')) return false

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)

  return expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
}

export async function exchangeEmbeddedSignupCode(code: string) {
  const appId = getRequiredEnv('META_APP_ID')
  const appSecret = getRequiredEnv('META_APP_SECRET')
  const { graphVersion } = getWhatsAppPlatformConfig()
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  })

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`, {
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as GraphTokenResponse

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error?.message || 'Meta Embedded Signup token exchange failed.')
  }

  return payload.access_token
}

export async function fetchWhatsAppPhoneNumber(phoneNumberId: string, accessToken: string) {
  const { graphVersion } = getWhatsAppPlatformConfig()
  const fields = ['display_phone_number', 'verified_name', 'code_verification_status', 'quality_rating'].join(',')
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=${fields}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as GraphPhoneNumberResponse

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not verify WhatsApp phone number.')
  }

  return {
    id: payload.id || phoneNumberId,
    displayPhoneNumber: payload.display_phone_number || '',
    verifiedName: payload.verified_name || '',
    codeVerificationStatus: payload.code_verification_status || '',
    qualityRating: payload.quality_rating || '',
  }
}

export async function subscribeWhatsAppApp(wabaId: string, accessToken: string) {
  const { graphVersion } = getWhatsAppPlatformConfig()
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }

  if (!response.ok) {
    return {
      ok: false,
      error: payload.error?.message || 'Could not subscribe the app to WhatsApp webhooks.',
    }
  }

  return { ok: true, error: '' }
}
