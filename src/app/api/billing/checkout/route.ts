import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getConfiguredBillingProvider, getProviderApiKey, getProviderPriceId, getSiteUrl } from '@/lib/billing/server-config'
import { isBillingProvider, isPaidAppPlan, type BillingProvider } from '@/lib/billing/plans'

export const runtime = 'nodejs'

interface CompanyRow {
  id: string
  owner_id: string
}

interface BillingCustomerRow {
  provider_customer_id: string
}

function jsonError(message: string, status: number, requestId: string) {
  return NextResponse.json({ error: message, requestId }, { status })
}

function safeLog(level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown>) {
  console[level](`[billing.checkout] ${message}`, meta)
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()

  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return jsonError('Not authenticated', 401, requestId)
    }

    const body = await request.json().catch(() => null) as {
      companyId?: unknown
      plan?: unknown
      provider?: unknown
    } | null

    const companyId = typeof body?.companyId === 'string' ? body.companyId : ''
    const plan = isPaidAppPlan(body?.plan) ? body.plan : null
    const provider: BillingProvider = isBillingProvider(body?.provider)
      ? body.provider
      : getConfiguredBillingProvider()

    if (!companyId) {
      return jsonError('Workspace is required', 400, requestId)
    }

    if (!plan) {
      return jsonError('Invalid plan', 400, requestId)
    }

    const priceId = getProviderPriceId(provider, plan)
    if (!priceId) {
      return jsonError('Billing price is not configured', 500, requestId)
    }

    const apiKey = getProviderApiKey(provider)
    if (!apiKey) {
      return jsonError('Billing provider is not configured', 500, requestId)
    }

    const adminSupabase = createSupabaseAdminClient()
    const { data: company, error: companyError } = await adminSupabase
      .from('companies')
      .select('id, owner_id')
      .eq('id', companyId)
      .maybeSingle<CompanyRow>()

    if (companyError) throw companyError
    if (!company) {
      return jsonError('Workspace not found', 404, requestId)
    }
    if (company.owner_id !== authData.user.id) {
      return jsonError('Workspace access denied', 403, requestId)
    }

    if (provider !== 'stripe') {
      return jsonError('Checkout creation for this provider is not enabled yet', 501, requestId)
    }

    const { data: existingCustomer } = await adminSupabase
      .from('billing_customers')
      .select('provider_customer_id')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .maybeSingle<BillingCustomerRow>()

    const siteUrl = getSiteUrl()
    const form = new URLSearchParams()
    form.set('mode', 'subscription')
    form.set('success_url', `${siteUrl}/app/upgrade?checkout=success`)
    form.set('cancel_url', `${siteUrl}/app/upgrade?checkout=cancelled`)
    form.set('client_reference_id', companyId)
    form.set('line_items[0][price]', priceId)
    form.set('line_items[0][quantity]', '1')
    form.set('metadata[company_id]', companyId)
    form.set('metadata[user_id]', authData.user.id)
    form.set('metadata[plan]', plan)
    form.set('subscription_data[metadata][company_id]', companyId)
    form.set('subscription_data[metadata][user_id]', authData.user.id)
    form.set('subscription_data[metadata][plan]', plan)

    if (existingCustomer?.provider_customer_id) {
      form.set('customer', existingCustomer.provider_customer_id)
    } else if (authData.user.email) {
      form.set('customer_email', authData.user.email)
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    })

    const data = await response.json().catch(() => ({})) as { url?: string; error?: { message?: string; type?: string } }
    if (!response.ok || !data.url) {
      safeLog('warn', 'Provider checkout creation failed', {
        requestId,
        provider,
        status: response.status,
        providerErrorType: data.error?.type ?? null,
      })
      return jsonError('Could not create checkout session', 502, requestId)
    }

    safeLog('info', 'Checkout session created', { requestId, provider, companyId, plan })
    return NextResponse.json({ url: data.url, requestId })
  } catch (error) {
    safeLog('error', 'Checkout route failed', {
      requestId,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError('Billing checkout failed', 500, requestId)
  }
}
