import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { getGoogleContactsAuthUrl, GOOGLE_CONTACTS_STATE_COOKIE } from '@/lib/google-contacts'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const state = randomBytes(24).toString('hex')
    const cookieStore = await cookies()
    cookieStore.set(GOOGLE_CONTACTS_STATE_COOKIE, JSON.stringify({ state, companyId }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    })

    return NextResponse.redirect(getGoogleContactsAuthUrl(state))
  } catch (error) {
    console.error('[google-contacts:start]', formatApiError(error))
    return NextResponse.redirect(new URL('/app/clients?googleContactsError=configuration', request.url))
  }
}
