import { getPlanRank, planDefinitions, type AppPlan } from '@/lib/billing/plans'

export type { AppPlan }

export interface AccountAccess {
  isAdmin: boolean
  plan: AppPlan
  workspaceLimit: number | null
  badgeLabel: string
  overrideSource: 'default' | 'manual' | 'payment'
}

export function getAccountAccess(_email: string | null | undefined): AccountAccess {
  void _email

  return {
    isAdmin: false,
    plan: 'free',
    workspaceLimit: planDefinitions.free.workspaceLimit,
    badgeLabel: 'Free plan: 1 workspace',
    overrideSource: 'default',
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
}: {
  isAdmin: boolean
  isPro: boolean
  overrideSource: 'default' | 'manual' | 'payment'
  activePlan?: AppPlan
}): AccountAccess {
  if (isAdmin) {
    return {
      isAdmin: true,
      plan: 'business',
      workspaceLimit: null,
      badgeLabel: 'Admin override',
      overrideSource,
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
    }
  }

  return {
    isAdmin: false,
    plan: 'free',
    workspaceLimit: planDefinitions.free.workspaceLimit,
    badgeLabel: 'Free plan: 1 workspace',
    overrideSource: 'default',
  }
}
