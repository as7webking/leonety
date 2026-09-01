import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getConfiguredBillingProvider, getPaddleApiBaseUrl, getProviderApiKey } from '@/lib/billing/server-config'

export const runtime = 'nodejs'

interface SubscriptionRow {
  provider_subscription_id: string
}

function jsonError(message: string, status: number, requestId: string) {
  return NextResponse.json({ error: message, requestId }, { status })
}

async function assertOwnedCompany(companyId: string, userId: string) {
  const adminSupabase = createSupabaseAdminClient()
  const { data, error } = await adminSupabase
    .from('companies')
    .select('id, owner_id')
    .eq('id', companyId)
    .maybeSingle<{ id: string; owner_id: string }>()

  if (error) throw error
  return Boolean(data && data.owner_id === userId)
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()

  try {
    const provider = getConfiguredBillingProvider()
    if (provider !== 'paddle') {
      return jsonError('Paddle billing is not selected', 500, requestId)
    }

    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      return jsonError('Not authenticated', 401, requestId)
    }

    const body = await request.json().catch(() => null) as { companyId?: unknown } | null
    const companyId = typeof body?.companyId === 'string' ? body.companyId : ''
    if (!companyId) {
      return jsonError('Workspace is required', 400, requestId)
    }

    if (!(await assertOwnedCompany(companyId, authData.user.id))) {
      return jsonError('Workspace access denied', 403, requestId)
    }

    const apiKey = getProviderApiKey('paddle')
    if (!apiKey) {
      return jsonError('Billing provider is not configured', 500, requestId)
    }

    const adminSupabase = createSupabaseAdminClient()
    const { data: subscription, error: subscriptionError } = await adminSupabase
      .from('billing_subscriptions')
      .select('provider_subscription_id')
      .eq('company_id', companyId)
      .eq('provider', 'paddle')
      .in('status', ['trialing', 'active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>()

    if (subscriptionError) throw subscriptionError
    if (!subscription) {
      return jsonError('No manageable subscription found', 404, requestId)
    }

    const response = await fetch(`${getPaddleApiBaseUrl()}/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await response.json().catch(() => ({})) as {
      data?: { management_urls?: { update_payment_method?: string | null; cancel?: string | null } }
      error?: { type?: string; code?: string }
    }

    const url = data.data?.management_urls?.update_payment_method ?? data.data?.management_urls?.cancel ?? null
    if (!response.ok || !url) {
      return jsonError('Subscription portal is not available', 502, requestId)
    }

    return NextResponse.json({ url, requestId })
  } catch {
    return jsonError('Subscription portal could not be opened', 500, requestId)
  }
}
