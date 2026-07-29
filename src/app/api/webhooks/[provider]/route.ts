import { handleBillingWebhook } from '@/lib/billing/webhook-handler'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params
  return handleBillingWebhook(request, provider)
}
