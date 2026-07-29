export const appPlans = ['free', 'starter', 'pro', 'business'] as const
export const paidAppPlans = ['starter', 'pro', 'business'] as const
export const billingProviders = ['stripe', 'paddle'] as const

export type AppPlan = typeof appPlans[number]
export type PaidAppPlan = typeof paidAppPlans[number]
export type BillingProvider = typeof billingProviders[number]

export interface PlanDefinition {
  plan: AppPlan
  monthlyPriceEur: number
  workspaceLimit: number | null
}

export const planDefinitions: Record<AppPlan, PlanDefinition> = {
  free: {
    plan: 'free',
    monthlyPriceEur: 0,
    workspaceLimit: 1,
  },
  starter: {
    plan: 'starter',
    monthlyPriceEur: 7,
    workspaceLimit: 2,
  },
  pro: {
    plan: 'pro',
    monthlyPriceEur: 19,
    workspaceLimit: null,
  },
  business: {
    plan: 'business',
    monthlyPriceEur: 29,
    workspaceLimit: null,
  },
}

export function isPaidAppPlan(value: unknown): value is PaidAppPlan {
  return typeof value === 'string' && paidAppPlans.includes(value as PaidAppPlan)
}

export function isBillingProvider(value: unknown): value is BillingProvider {
  return typeof value === 'string' && billingProviders.includes(value as BillingProvider)
}

export function getPlanRank(plan: AppPlan) {
  switch (plan) {
    case 'business':
      return 3
    case 'pro':
      return 2
    case 'starter':
      return 1
    default:
      return 0
  }
}
