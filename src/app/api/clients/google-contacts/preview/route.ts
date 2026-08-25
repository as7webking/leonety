import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { decryptSecret } from '@/lib/credential-encryption'
import { fetchGoogleContactsPreview, GOOGLE_CONTACTS_COOKIE } from '@/lib/google-contacts'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const cookieStore = await cookies()
    const encryptedToken = cookieStore.get(GOOGLE_CONTACTS_COOKIE)?.value
    if (!encryptedToken) {
      return NextResponse.json({ error: 'Google Contacts authorization is missing or expired.' }, { status: 401 })
    }

    const contacts = await fetchGoogleContactsPreview(decryptSecret(encryptedToken))
    return NextResponse.json({ contacts })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
