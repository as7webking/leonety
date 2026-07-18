import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { normalizeStoreUrl } from '@/lib/store-integrations'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const storeUrl = typeof body.storeUrl === 'string' ? body.storeUrl : ''
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    if (!storeUrl || !apiKey) {
      return NextResponse.json({ error: 'OpenCart store URL and API key are required.' }, { status: 400 })
    }

    const baseUrl = normalizeStoreUrl(storeUrl)
    const response = await fetch(`${baseUrl}/index.php?route=api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey }),
      cache: 'no-store',
    })

    const text = await response.text()
    let payload: { success?: string; error?: string; api_token?: string } = {}

    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = {}
    }

    if (!response.ok || payload.error) {
      return NextResponse.json({
        error: payload.error || `OpenCart API test failed with ${response.status}. Check the API key, IP allowlist, and OpenCart API settings.`,
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: payload.success || 'OpenCart API responded.',
      hasApiToken: Boolean(payload.api_token),
    })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
