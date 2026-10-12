import type { AppPlan } from '@/lib/billing/plans'

export function mailboxLimitForPlan(plan: AppPlan) {
  switch (plan) {
    case 'free': return 1
    case 'starter': return 2
    case 'pro':
    case 'business': return 4
    default: return 1
  }
}
