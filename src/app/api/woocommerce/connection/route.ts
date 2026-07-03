import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { normalizeWooStoreUrl } from '@/lib/woocommerce'

export const runtime = 'nodejs'

interface ConnectionRow {
  id: string
  store_url: string
  consumer_key: string
  consumer_secret: string
  inventory_sync_enabled: boolean
  active: boolean
  updated_at: string
}

function publicConnection(row: ConnectionRow | null) {
  const maskSecret = (value?: string | null) => {
    if (!value) return ''
    return value.length <= 8 ? '••••••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`
  }

  return {
    connected: Boolean(row?.active),
    storeUrl: row?.store_url ?? '',
    consumerKeyPreview: maskSecret(row?.consumer_key),
    consumerSecretPreview: maskSecret(row?.consumer_secret),
    inventorySyncEnabled: Boolean(row?.inventory_sync_enabled),
    updatedAt: row?.updated_at ?? null,
  }
}

export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const { data, error } = await auth.adminSupabase
      .from('woocommerce_connections')
      .select('id, store_url, consumer_key, consumer_secret, inventory_sync_enabled, active, updated_at')
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json(publicConnection((data as ConnectionRow | null) ?? null))
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const storeUrl = typeof body.storeUrl === 'string' ? body.storeUrl : ''
    const consumerKey = typeof body.consumerKey === 'string' ? body.consumerKey.trim() : ''
    const consumerSecret = typeof body.consumerSecret === 'string' ? body.consumerSecret.trim() : ''
    const inventorySyncEnabled = Boolean(body.inventorySyncEnabled)
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const normalizedStoreUrl = normalizeWooStoreUrl(storeUrl)
    const { data: existing, error: existingError } = await auth.adminSupabase
      .from('woocommerce_connections')
      .select('id, consumer_key, consumer_secret')
      .eq('company_id', companyId)
      .maybeSingle()

    if (existingError) throw existingError

    if (!existing && (!consumerKey || !consumerSecret)) {
      return NextResponse.json({ error: 'Consumer key and consumer secret are required.' }, { status: 400 })
    }

    const payload = {
      company_id: companyId,
      store_url: normalizedStoreUrl,
      consumer_key: consumerKey || (existing as ConnectionRow | null)?.consumer_key,
      consumer_secret: consumerSecret || (existing as ConnectionRow | null)?.consumer_secret,
      inventory_sync_enabled: inventorySyncEnabled,
      active: true,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await auth.adminSupabase
      .from('woocommerce_connections')
      .upsert(payload, { onConflict: 'company_id' })
      .select('id, store_url, consumer_key, consumer_secret, inventory_sync_enabled, active, updated_at')
      .single()

    if (error) throw error

    return NextResponse.json(publicConnection(data as ConnectionRow))
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const companyId = typeof body.companyId === 'string' ? body.companyId : ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const { error } = await auth.adminSupabase
      .from('woocommerce_connections')
      .delete()
      .eq('company_id', companyId)

    if (error) throw error

    return NextResponse.json(publicConnection(null))
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
