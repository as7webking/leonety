import { handleBillingWebhook } from '@/lib/billing/webhook-handler'
import { getConfiguredBillingProvider } from '@/lib/billing/server-config'
import { isBillingProvider } from '@/lib/billing/plans'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const headerProvider = request.headers.get('x-leonety-billing-provider')?.trim().toLowerCase()
  const provider = isBillingProvider(headerProvider) ? headerProvider : getConfiguredBillingProvider()

  return handleBillingWebhook(request, provider)
}
