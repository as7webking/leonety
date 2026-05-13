export type AppPlan = 'free' | 'pro'

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
    workspaceLimit: 1,
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
}: {
  isAdmin: boolean
  isPro: boolean
  overrideSource: 'default' | 'manual' | 'payment'
}): AccountAccess {
  if (isAdmin) {
    return {
      isAdmin: true,
      plan: 'pro',
      workspaceLimit: null,
      badgeLabel: 'Admin override',
      overrideSource,
    }
  }

  if (isPro) {
    return {
      isAdmin: false,
      plan: 'pro',
      workspaceLimit: null,
      badgeLabel: 'Pro access',
      overrideSource,
    }
  }

  return {
    isAdmin: false,
    plan: 'free',
    workspaceLimit: 1,
    badgeLabel: 'Free plan: 1 workspace',
    overrideSource: 'default',
  }
}
