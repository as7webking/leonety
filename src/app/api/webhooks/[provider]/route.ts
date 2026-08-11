import { handleBillingWebhook } from '@/lib/billing/webhook-handler'
import { isBillingProvider } from '@/lib/billing/plans'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params

  if (!isBillingProvider(provider)) {
    return Response.json({ error: 'Unsupported billing provider' }, { status: 404 })
  }

  return handleBillingWebhook(request, provider)
}
