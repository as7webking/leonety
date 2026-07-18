import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import {
  getStoreIntegrationCallbackUrl,
  isStoreProvider,
  normalizeShopifyShop,
} from '@/lib/store-integrations'

export const runtime = 'nodejs'

const COOKIE_NAME = 'leonety_store_oauth_state'
const SHOPIFY_SCOPES = ['read_products', 'write_products', 'read_inventory', 'write_inventory'].join(',')
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/content',
  'openid',
  'email',
  'profile',
].join(' ')

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const companyId = url.searchParams.get('companyId') ?? ''
    const provider = url.searchParams.get('provider')
    const storeUrl = url.searchParams.get('storeUrl') ?? ''
    const merchantId = url.searchParams.get('merchantId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (!isStoreProvider(provider) || !['shopify', 'google_merchant'].includes(provider)) {
      return NextResponse.json({ error: 'OAuth provider is not supported.' }, { status: 400 })
    }

    const state = randomBytes(24).toString('hex')
    const cookiePayload = JSON.stringify({ state, companyId, provider, storeUrl, merchantId })
    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, cookiePayload, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    })

    if (provider === 'shopify') {
      const clientId = process.env.SHOPIFY_CLIENT_ID
      if (!clientId) {
        return NextResponse.json({ error: 'SHOPIFY_CLIENT_ID is missing.' }, { status: 500 })
      }

      const shop = normalizeShopifyShop(storeUrl)
      const redirectUrl = new URL(`https://${shop}/admin/oauth/authorize`)
      redirectUrl.searchParams.set('client_id', clientId)
      redirectUrl.searchParams.set('scope', SHOPIFY_SCOPES)
      redirectUrl.searchParams.set('redirect_uri', getStoreIntegrationCallbackUrl('shopify'))
      redirectUrl.searchParams.set('state', state)

      return NextResponse.redirect(redirectUrl)
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'GOOGLE_CLIENT_ID is missing.' }, { status: 500 })
    }

    const redirectUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    redirectUrl.searchParams.set('client_id', clientId)
    redirectUrl.searchParams.set('redirect_uri', getStoreIntegrationCallbackUrl('google_merchant'))
    redirectUrl.searchParams.set('response_type', 'code')
    redirectUrl.searchParams.set('scope', GOOGLE_SCOPES)
    redirectUrl.searchParams.set('access_type', 'offline')
    redirectUrl.searchParams.set('prompt', 'consent')
    redirectUrl.searchParams.set('state', state)

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
