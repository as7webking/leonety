import { NextResponse } from 'next/server'
import { buildAccountAccess, getAccountAccess } from '@/lib/account-access'
import { getPlanRank, type AppPlan } from '@/lib/billing/plans'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface CompanyRow {
  id: string
}

interface AppAccessRow {
  company_id: string
  tier: AppPlan
  manual_override: boolean
  active: boolean
  expires_at: string | null
}

function isActivePaidAccess(access: AppAccessRow | undefined) {
  if (!access || !access.active || getPlanRank(access.tier) === 0) {
    return false
  }

  return !access.expires_at || new Date(access.expires_at) > new Date()
}

function getConfiguredAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || process.env.UPGRADE_REQUEST_ADMIN_EMAIL?.trim().toLowerCase() || null
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ accountAccess: getAccountAccess(null) }, { status: 401 })
    }

    const fallbackAccess = getAccountAccess(authData.user.email)
    const configuredAdminEmail = getConfiguredAdminEmail()
    const userEmail = authData.user.email?.trim().toLowerCase() ?? null
    const adminSupabase = createSupabaseAdminClient()

    const [{ data: companies }, { data: adminAccount }] = await Promise.all([
      adminSupabase
        .from('companies')
        .select('id')
        .eq('owner_id', authData.user.id),
      adminSupabase
        .from('admin_accounts')
        .select('user_id')
        .eq('user_id', authData.user.id)
        .maybeSingle(),
    ])

    const companyIds = ((companies ?? []) as CompanyRow[]).map((company) => company.id)
    const { data: appAccessRows } = companyIds.length > 0
      ? await adminSupabase
          .from('app_access')
          .select('company_id, tier, manual_override, active, expires_at')
          .in('company_id', companyIds)
      : { data: [] }

    const activePaidAccess = ((appAccessRows ?? []) as AppAccessRow[])
      .filter((access) => isActivePaidAccess(access))
      .sort((left, right) => getPlanRank(right.tier) - getPlanRank(left.tier))[0]
    const isAdmin = fallbackAccess.isAdmin || Boolean(adminAccount) || Boolean(configuredAdminEmail && userEmail === configuredAdminEmail)
    const isPro = Boolean(activePaidAccess) || getPlanRank(fallbackAccess.plan) > 0
    const overrideSource = activePaidAccess
      ? activePaidAccess.manual_override ? 'manual' : 'payment'
      : fallbackAccess.overrideSource

    return NextResponse.json({
      accountAccess: buildAccountAccess({
        isAdmin,
        isPro,
        overrideSource,
        activePlan: activePaidAccess?.tier,
      }),
    })
  } catch (error) {
    console.error('Account access lookup failed:', error)
    return NextResponse.json({ accountAccess: getAccountAccess(null) }, { status: 500 })
  }
}
