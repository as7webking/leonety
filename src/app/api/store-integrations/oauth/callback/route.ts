import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import {
  getStoreIntegrationCallbackUrl,
  isStoreProvider,
  normalizeShopifyShop,
  type StoreProvider,
} from '@/lib/store-integrations'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'

const COOKIE_NAME = 'leonety_store_oauth_state'

interface OAuthState {
  state: string
  companyId: string
  provider: StoreProvider
  storeUrl: string
  merchantId: string
}

function redirectWithMessage(message: string, type: 'message' | 'error' = 'message') {
  const url = new URL('/app/settings/integrations', getSiteUrl())
  url.searchParams.set(type, message)
  return NextResponse.redirect(url)
}

async function exchangeShopifyCode(shop: string, code: string) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET is missing.')
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Shopify OAuth token exchange failed.')
  }

  return {
    accessToken: String(payload.access_token ?? ''),
    refreshToken: '',
  }
}

async function exchangeGoogleCode(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getStoreIntegrationCallbackUrl('google_merchant'),
    }),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google OAuth token exchange failed.')
  }

  return {
    accessToken: String(payload.access_token ?? ''),
    refreshToken: String(payload.refresh_token ?? ''),
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const providerParam = url.searchParams.get('provider')
    const cookieStore = await cookies()
    const rawState = cookieStore.get(COOKIE_NAME)?.value

    if (!code || !state || !rawState) {
      return redirectWithMessage('Missing OAuth callback data.', 'error')
    }

    const parsed = JSON.parse(rawState) as OAuthState
    cookieStore.delete(COOKIE_NAME)

    if (parsed.state !== state || !isStoreProvider(parsed.provider) || parsed.provider !== providerParam) {
      return redirectWithMessage('OAuth state validation failed.', 'error')
    }

    const auth = await requireOwnedCompany(parsed.companyId)
    if ('error' in auth) return auth.error

    const shop = parsed.provider === 'shopify' ? normalizeShopifyShop(url.searchParams.get('shop') ?? parsed.storeUrl) : ''
    const tokens = parsed.provider === 'shopify'
      ? await exchangeShopifyCode(shop, code)
      : await exchangeGoogleCode(code)

    const payload = {
      company_id: parsed.companyId,
      provider: parsed.provider,
      store_name: parsed.provider === 'shopify' ? shop : 'Google Merchant',
      store_url: parsed.provider === 'shopify' ? `https://${shop}` : '',
      external_account_id: parsed.provider === 'shopify' ? shop : '',
      merchant_id: parsed.merchantId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      status: 'connected',
      error_message: null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await auth.adminSupabase
      .from('store_integrations')
      .upsert(payload, { onConflict: 'company_id,provider' })

    if (error) throw error

    return redirectWithMessage('Integration connected.')
  } catch (error) {
    return redirectWithMessage(formatApiError(error), 'error')
  }
}
