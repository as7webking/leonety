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

interface BillingSubscriptionRow {
  company_id: string
  plan: AppPlan
  status: 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'
  current_period_end: string | null
  cancel_at_period_end: boolean
}

function isUnexpiredDate(value: string | null) {
  return !value || new Date(value) > new Date()
}

function isActivePaidAccess(access: AppAccessRow | undefined) {
  if (!access || !access.active || getPlanRank(access.tier) === 0) {
    return false
  }

  return isUnexpiredDate(access.expires_at)
}

function isEntitledSubscription(subscription: BillingSubscriptionRow | undefined) {
  if (!subscription || getPlanRank(subscription.plan) === 0) return false
  if (!['trialing', 'active'].includes(subscription.status)) return false
  return isUnexpiredDate(subscription.current_period_end)
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
    const [{ data: appAccessRows }, { data: subscriptionRows }] = companyIds.length > 0
      ? await Promise.all([
          adminSupabase
            .from('app_access')
            .select('company_id, tier, manual_override, active, expires_at')
            .in('company_id', companyIds),
          adminSupabase
            .from('billing_subscriptions')
            .select('company_id, plan, status, current_period_end, cancel_at_period_end')
            .in('company_id', companyIds),
        ])
      : [{ data: [] }, { data: [] }]

    const manualAccess = ((appAccessRows ?? []) as AppAccessRow[])
      .filter((access) => access.manual_override && isActivePaidAccess(access))
      .sort((left, right) => getPlanRank(right.tier) - getPlanRank(left.tier))[0]
    const paidSubscription = ((subscriptionRows ?? []) as BillingSubscriptionRow[])
      .filter((subscription) => isEntitledSubscription(subscription))
      .sort((left, right) => getPlanRank(right.plan) - getPlanRank(left.plan))[0]
    const storedAccess = ((appAccessRows ?? []) as AppAccessRow[])
      .filter((access) => !access.manual_override && isActivePaidAccess(access))
      .sort((left, right) => getPlanRank(right.tier) - getPlanRank(left.tier))[0]
    const activeAccess = manualAccess ?? (paidSubscription ? undefined : storedAccess)
    const activePlan = manualAccess?.tier ?? paidSubscription?.plan ?? storedAccess?.tier
    const isAdmin = fallbackAccess.isAdmin || Boolean(adminAccount) || Boolean(configuredAdminEmail && userEmail === configuredAdminEmail)
    const isPro = Boolean(activePlan && getPlanRank(activePlan) > 0) || getPlanRank(fallbackAccess.plan) > 0
    const overrideSource = manualAccess
      ? 'manual'
      : paidSubscription
        ? 'payment'
        : storedAccess
          ? 'payment'
      : fallbackAccess.overrideSource

    return NextResponse.json({
      accountAccess: buildAccountAccess({
        isAdmin,
        isPro,
        overrideSource,
        activePlan,
        status: manualAccess ? 'manual' : paidSubscription?.status ?? (storedAccess ? 'active' : undefined),
        currentPeriodEnd: paidSubscription?.current_period_end ?? activeAccess?.expires_at ?? null,
        trialEndsAt: paidSubscription?.status === 'trialing' ? paidSubscription.current_period_end : null,
        cancelAtPeriodEnd: paidSubscription?.cancel_at_period_end ?? false,
      }),
    })
  } catch (error) {
    console.error('Account access lookup failed:', error)
    return NextResponse.json({ accountAccess: getAccountAccess(null) }, { status: 500 })
  }
}
