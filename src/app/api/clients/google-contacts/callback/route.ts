import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { encryptSecret } from '@/lib/credential-encryption'
import {
  exchangeGoogleContactsCode,
  GOOGLE_CONTACTS_COOKIE,
  GOOGLE_CONTACTS_STATE_COOKIE,
} from '@/lib/google-contacts'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'

function redirectToClients(params: Record<string, string>) {
  const url = new URL('/app/clients', getSiteUrl())
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const cookieStore = await cookies()
    const rawState = cookieStore.get(GOOGLE_CONTACTS_STATE_COOKIE)?.value

    if (!code || !state || !rawState) {
      return redirectToClients({ googleContactsError: 'missing_oauth_data' })
    }

    const parsed = JSON.parse(rawState) as { state?: string; companyId?: string }
    cookieStore.delete(GOOGLE_CONTACTS_STATE_COOKIE)

    if (parsed.state !== state || !parsed.companyId) {
      return redirectToClients({ googleContactsError: 'invalid_state' })
    }

    const auth = await requireOwnedCompany(parsed.companyId)
    if ('error' in auth) return auth.error

    const accessToken = await exchangeGoogleContactsCode(code)
    cookieStore.set(GOOGLE_CONTACTS_COOKIE, encryptSecret(accessToken), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    })

    return redirectToClients({ googleContacts: 'preview' })
  } catch {
    return redirectToClients({ googleContactsError: 'authorization_failed' })
  }
}
