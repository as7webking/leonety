import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface CompanyRow {
  id: string
  name: string
}

interface AppAccessRow {
  company_id: string
  tier: 'free' | 'starter' | 'pro' | 'business'
  manual_override: boolean
  active: boolean
  expires_at: string | null
}

interface UpgradeRequestRow {
  id: string
  user_id: string
  company_id: string
  requested_plan: 'pro'
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string }
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code ? `Code: ${maybeError.code}` : '']
      .filter(Boolean)
      .join(' · ')
  }

  return 'Unknown error'
}

function isActiveProAccess(access: AppAccessRow | undefined) {
  if (!access || !access.active || access.tier !== 'pro') {
    return false
  }

  return !access.expires_at || new Date(access.expires_at) > new Date()
}

async function loadUpgradeContext(userId: string) {
  const adminSupabase = createSupabaseAdminClient()

  const { data: companies, error: companiesError } = await adminSupabase
    .from('companies')
    .select('id, name')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  if (companiesError) throw companiesError

  const company = ((companies ?? []) as CompanyRow[])[0] ?? null
  if (!company) {
    return {
      company: null,
      currentPlan: 'free' as const,
      pendingRequest: null,
      isPro: false,
    }
  }

  const [{ data: accessRows, error: accessError }, { data: pendingRequest, error: requestError }] = await Promise.all([
    adminSupabase
      .from('app_access')
      .select('company_id, tier, manual_override, active, expires_at')
      .eq('company_id', company.id),
    adminSupabase
      .from('upgrade_requests')
      .select('id, user_id, company_id, requested_plan, status, message, created_at, reviewed_at, reviewed_by')
      .eq('user_id', userId)
      .eq('company_id', company.id)
      .eq('requested_plan', 'pro')
      .eq('status', 'pending')
      .maybeSingle<UpgradeRequestRow>(),
  ])

  if (accessError) throw accessError
  if (requestError) throw requestError

  const activeAccess = ((accessRows ?? []) as AppAccessRow[]).find((access) => access.active)
  const isPro = isActiveProAccess(activeAccess)

  return {
    company,
    currentPlan: isPro ? 'pro' as const : activeAccess?.tier ?? 'free' as const,
    pendingRequest: pendingRequest ?? null,
    isPro,
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const context = await loadUpgradeContext(authData.user.id)
    return NextResponse.json(context)
  } catch (error) {
    console.error('Upgrade request GET failed:', error)
    return NextResponse.json({ error: formatError(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const context = await loadUpgradeContext(authData.user.id)
    if (!context.company) {
      return NextResponse.json({ error: 'Create a workspace before requesting Pro access.' }, { status: 400 })
    }

    if (context.isPro) {
      return NextResponse.json(context)
    }

    if (context.pendingRequest) {
      return NextResponse.json(context)
    }

    const body = await request.json().catch(() => ({}))
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : null
    const adminSupabase = createSupabaseAdminClient()

    const { error: insertError } = await adminSupabase
      .from('upgrade_requests')
      .insert({
        user_id: authData.user.id,
        company_id: context.company.id,
        requested_plan: 'pro',
        status: 'pending',
        message,
      })

    if (insertError) throw insertError

    // TODO: Wire an email provider here later. Keep provider secrets server-side only.
    // Suggested env var for the recipient: UPGRADE_REQUEST_ADMIN_EMAIL.
    // Email content should include authData.user.email, context.company.name, requested plan Pro, and created_at.

    const nextContext = await loadUpgradeContext(authData.user.id)
    return NextResponse.json({
      ...nextContext,
      message: 'Your Pro request has been sent for review.',
    })
  } catch (error) {
    console.error('Upgrade request POST failed:', error)
    return NextResponse.json({ error: formatError(error) }, { status: 500 })
  }
}
