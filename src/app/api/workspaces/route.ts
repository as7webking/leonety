import { NextResponse } from 'next/server'
import { canCreateWorkspace } from '@/lib/account-access'
import { resolveAccountAccessForUser } from '@/lib/account-access-server'
import { isSupportedCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()
  return error ? null : data.user
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    const resolved = await resolveAccountAccessForUser(user.id, user.email)
    return NextResponse.json({
      accountAccess: resolved.accountAccess,
      workspaceCount: resolved.workspaceCount,
      canCreate: canCreateWorkspace(resolved.workspaceCount, resolved.accountAccess),
    })
  } catch (error) {
    console.error('[workspaces] entitlement lookup failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({ error: 'entitlement_lookup_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    const body = await request.json().catch(() => null) as {
      name?: unknown
      type?: unknown
      currency?: unknown
    } | null
    const type = body?.type === 'business' ? 'business' : body?.type === 'personal' ? 'personal' : null
    const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
    const rawCurrency = typeof body?.currency === 'string' ? body.currency.trim().toUpperCase() : ''

    if (!type || !rawCurrency || !isSupportedCurrency(rawCurrency)) {
      return NextResponse.json({ error: 'invalid_workspace' }, { status: 400 })
    }
    if (type === 'business' && !rawName) {
      return NextResponse.json({ error: 'company_name_required' }, { status: 400 })
    }

    const resolved = await resolveAccountAccessForUser(user.id, user.email)
    if (!canCreateWorkspace(resolved.workspaceCount, resolved.accountAccess)) {
      return NextResponse.json({
        error: 'workspace_limit_reached',
        accountAccess: resolved.accountAccess,
        workspaceCount: resolved.workspaceCount,
      }, { status: 409 })
    }

    const name = (rawName || 'Personal Workspace').slice(0, 160)
    const adminSupabase = createSupabaseAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .insert({
        owner_id: user.id,
        name,
        type,
        currency: normalizeCurrencyCode(rawCurrency),
      })
      .select('id')
      .single<{ id: string }>()

    if (error) {
      if (error.message.includes('workspace_limit_reached')) {
        return NextResponse.json({ error: 'workspace_limit_reached' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    console.error('[workspaces] creation failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({ error: 'workspace_create_failed' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    const body = await request.json().catch(() => null) as {
      companyId?: unknown
      name?: unknown
      type?: unknown
      currency?: unknown
    } | null
    const companyId = typeof body?.companyId === 'string' ? body.companyId.trim() : ''
    const type = body?.type === 'business' ? 'business' : body?.type === 'personal' ? 'personal' : null
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 160) : ''
    const currency = typeof body?.currency === 'string' ? body.currency.trim().toUpperCase() : ''

    if (!companyId || !type || !name || !isSupportedCurrency(currency)) {
      return NextResponse.json({ error: 'invalid_workspace' }, { status: 400 })
    }

    const adminSupabase = createSupabaseAdminClient()
    const { data, error } = await adminSupabase
      .from('companies')
      .update({
        name,
        type,
        currency: normalizeCurrencyCode(currency),
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
      .eq('owner_id', user.id)
      .select('id, owner_id, name, type, currency, created_at, updated_at')
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'workspace_not_found' }, { status: 404 })

    return NextResponse.json({ workspace: data })
  } catch (error) {
    console.error('[workspaces] update failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({ error: 'workspace_update_failed' }, { status: 500 })
  }
}
