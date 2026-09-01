import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getConfiguredBillingProvider, getPaddleApiBaseUrl, getProviderApiKey } from '@/lib/billing/server-config'

export const runtime = 'nodejs'

interface SubscriptionRow {
  provider_subscription_id: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

function jsonError(message: string, status: number, requestId: string) {
  return NextResponse.json({ error: message, requestId }, { status })
}

function safeLog(level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown>) {
  console[level](`[billing.cancel] ${message}`, meta)
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
      .select('provider_subscription_id, status, current_period_end, cancel_at_period_end')
      .eq('company_id', companyId)
      .eq('provider', 'paddle')
      .in('status', ['trialing', 'active'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>()

    if (subscriptionError) throw subscriptionError
    if (!subscription) {
      return jsonError('No active subscription found', 404, requestId)
    }
    if (subscription.cancel_at_period_end) {
      return NextResponse.json({
        ok: true,
        requestId,
        currentPeriodEnd: subscription.current_period_end,
        alreadyScheduled: true,
      })
    }

    const response = await fetch(`${getPaddleApiBaseUrl()}/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ effective_from: 'next_billing_period' }),
    })

    const data = await response.json().catch(() => ({})) as {
      data?: { current_billing_period?: { ends_at?: string | null }; scheduled_change?: { action?: string | null } | null }
      error?: { type?: string; code?: string }
    }

    if (!response.ok) {
      safeLog('warn', 'Paddle cancellation request failed', {
        requestId,
        status: response.status,
        providerErrorType: data.error?.type ?? null,
        providerErrorCode: data.error?.code ?? null,
      })
      return jsonError('Subscription cancellation could not be scheduled', 502, requestId)
    }

    const currentPeriodEnd = data.data?.current_billing_period?.ends_at ?? subscription.current_period_end
    await adminSupabase
      .from('billing_subscriptions')
      .update({
        cancel_at_period_end: true,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'paddle')
      .eq('provider_subscription_id', subscription.provider_subscription_id)

    safeLog('info', 'Subscription cancellation scheduled', { requestId, companyId })
    return NextResponse.json({ ok: true, requestId, currentPeriodEnd })
  } catch (error) {
    safeLog('error', 'Cancellation route failed', {
      requestId,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError('Subscription cancellation failed', 500, requestId)
  }
}
