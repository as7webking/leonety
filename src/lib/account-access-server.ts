import 'server-only'

import { buildAccountAccess, getAccountAccess, type AccountAccess } from '@/lib/account-access'
import { getPlanRank, type AppPlan } from '@/lib/billing/plans'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

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
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export interface ResolvedAccountAccess {
  accountAccess: AccountAccess
  companyIds: string[]
  workspaceCount: number
}

function isUnexpiredDate(value: string | null) {
  return !value || new Date(value) > new Date()
}

function isActivePaidAccess(access: AppAccessRow | undefined) {
  return Boolean(access && access.active && getPlanRank(access.tier) > 0 && isUnexpiredDate(access.expires_at))
}

function isEntitledSubscription(subscription: BillingSubscriptionRow | undefined) {
  return Boolean(
    subscription
      && getPlanRank(subscription.plan) > 0
      && ['trialing', 'active'].includes(subscription.status)
      && isUnexpiredDate(subscription.current_period_end)
  )
}

function getConfiguredAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase()
    || process.env.UPGRADE_REQUEST_ADMIN_EMAIL?.trim().toLowerCase()
    || null
}

export async function resolveAccountAccessForUser(
  userId: string,
  email: string | null | undefined,
): Promise<ResolvedAccountAccess> {
  const fallbackAccess = getAccountAccess(email)
  const configuredAdminEmail = getConfiguredAdminEmail()
  const userEmail = email?.trim().toLowerCase() ?? null
  const adminSupabase = createSupabaseAdminClient()

  const [{ data: companies, error: companiesError }, { data: adminAccount, error: adminError }] = await Promise.all([
    adminSupabase.from('companies').select('id').eq('owner_id', userId),
    adminSupabase.from('admin_accounts').select('user_id').eq('user_id', userId).maybeSingle(),
  ])

  if (companiesError) throw companiesError
  if (adminError) throw adminError

  const isConfiguredAdmin = Boolean(configuredAdminEmail && userEmail === configuredAdminEmail)
  if (isConfiguredAdmin && !adminAccount && email) {
    const { error: configuredAdminError } = await adminSupabase
      .from('admin_accounts')
      .upsert({ user_id: userId, email })
    if (configuredAdminError) throw configuredAdminError
  }

  const companyIds = ((companies ?? []) as CompanyRow[]).map((company) => company.id)
  const [{ data: appAccessRows, error: accessError }, { data: subscriptionRows, error: subscriptionError }] = companyIds.length > 0
    ? await Promise.all([
        adminSupabase
          .from('app_access')
          .select('company_id, tier, manual_override, active, expires_at')
          .in('company_id', companyIds),
        adminSupabase
          .from('billing_subscriptions')
          .select('company_id, plan, status, current_period_start, current_period_end, cancel_at_period_end')
          .in('company_id', companyIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]

  if (accessError) throw accessError
  if (subscriptionError) throw subscriptionError

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
  const isAdmin = fallbackAccess.isAdmin
    || Boolean(adminAccount)
    || isConfiguredAdmin
  const isPro = Boolean(activePlan && getPlanRank(activePlan) > 0) || getPlanRank(fallbackAccess.plan) > 0
  const overrideSource = manualAccess
    ? 'manual'
    : paidSubscription
      ? 'payment'
      : storedAccess
        ? 'payment'
        : fallbackAccess.overrideSource

  return {
    companyIds,
    workspaceCount: companyIds.length,
    accountAccess: buildAccountAccess({
      isAdmin,
      isPro,
      overrideSource,
      activePlan,
      status: manualAccess ? 'manual' : paidSubscription?.status ?? (storedAccess ? 'active' : undefined),
      currentPeriodStart: paidSubscription?.current_period_start ?? null,
      currentPeriodEnd: paidSubscription?.current_period_end ?? activeAccess?.expires_at ?? null,
      nextBillingDate: paidSubscription?.cancel_at_period_end ? null : paidSubscription?.current_period_end ?? null,
      trialEndsAt: paidSubscription?.status === 'trialing' ? paidSubscription.current_period_end : null,
      cancelAtPeriodEnd: paidSubscription?.cancel_at_period_end ?? false,
      canCancelSubscription: Boolean(
        paidSubscription
          && !paidSubscription.cancel_at_period_end
          && ['trialing', 'active'].includes(paidSubscription.status)
      ),
      canManageSubscription: Boolean(
        paidSubscription && ['trialing', 'active', 'past_due'].includes(paidSubscription.status)
      ),
    }),
  }
}
