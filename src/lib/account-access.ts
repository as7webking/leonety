import { getPlanRank, planDefinitions, type AppPlan } from '@/lib/billing/plans'

export type { AppPlan }

export interface AccountAccess {
  isAdmin: boolean
  plan: AppPlan
  workspaceLimit: number | null
  badgeLabel: string
  overrideSource: 'default' | 'manual' | 'payment'
  status?: 'free' | 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired' | 'manual'
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  nextBillingDate?: string | null
  trialEndsAt?: string | null
  cancelAtPeriodEnd?: boolean
  canCancelSubscription?: boolean
  canManageSubscription?: boolean
}

export function getAccountAccess(_email: string | null | undefined): AccountAccess {
  void _email

  return {
    isAdmin: false,
    plan: 'free',
    workspaceLimit: planDefinitions.free.workspaceLimit,
    badgeLabel: 'Free plan: 1 workspace',
    overrideSource: 'default',
    status: 'free',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: null,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canCancelSubscription: false,
    canManageSubscription: false,
  }
}

export function canCreateWorkspace(existingWorkspaceCount: number, access: AccountAccess) {
  return access.workspaceLimit === null || existingWorkspaceCount < access.workspaceLimit
}

export function buildAccountAccess({
  isAdmin,
  isPro,
  overrideSource,
  activePlan,
  status,
  currentPeriodEnd,
  currentPeriodStart,
  nextBillingDate,
  trialEndsAt,
  cancelAtPeriodEnd,
  canCancelSubscription,
  canManageSubscription,
}: {
  isAdmin: boolean
  isPro: boolean
  overrideSource: 'default' | 'manual' | 'payment'
  activePlan?: AppPlan
  status?: AccountAccess['status']
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  nextBillingDate?: string | null
  trialEndsAt?: string | null
  cancelAtPeriodEnd?: boolean
  canCancelSubscription?: boolean
  canManageSubscription?: boolean
}): AccountAccess {
  if (isAdmin) {
    return {
      isAdmin: true,
      plan: 'business',
      workspaceLimit: null,
      badgeLabel: 'Admin override',
      overrideSource,
      status: 'manual',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextBillingDate: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      canCancelSubscription: false,
      canManageSubscription: false,
    }
  }

  const paidPlan = activePlan && getPlanRank(activePlan) > 0
    ? activePlan
    : isPro
      ? 'pro'
      : null

  if (paidPlan) {
    const definition = planDefinitions[paidPlan]
    return {
      isAdmin: false,
      plan: paidPlan,
      workspaceLimit: definition.workspaceLimit,
      badgeLabel: `${paidPlan.charAt(0).toUpperCase()}${paidPlan.slice(1)} access`,
      overrideSource,
      status: status ?? (overrideSource === 'manual' ? 'manual' : 'active'),
      currentPeriodStart: currentPeriodStart ?? null,
      currentPeriodEnd: currentPeriodEnd ?? null,
      nextBillingDate: nextBillingDate ?? currentPeriodEnd ?? null,
      trialEndsAt: trialEndsAt ?? null,
      cancelAtPeriodEnd: cancelAtPeriodEnd ?? false,
      canCancelSubscription: canCancelSubscription ?? false,
      canManageSubscription: canManageSubscription ?? false,
    }
  }

  return {
    isAdmin: false,
    plan: 'free',
    workspaceLimit: planDefinitions.free.workspaceLimit,
    badgeLabel: 'Free plan: 1 workspace',
    overrideSource: 'default',
    status: 'free',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: null,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canCancelSubscription: false,
    canManageSubscription: false,
  }
}
