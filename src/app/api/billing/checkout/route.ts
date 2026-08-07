import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getConfiguredBillingProvider, getPaddleApiBaseUrl, getProviderApiKey, getProviderPriceId, getSiteUrl } from '@/lib/billing/server-config'
import { isPaidAppPlan, type BillingProvider } from '@/lib/billing/plans'

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

function getSafeReturnUrl(path: 'success' | 'cancelled') {
  const siteUrl = getSiteUrl()
  return `${siteUrl}/app/upgrade?checkout=${path}`
}

async function createPaddleCheckout({
  apiKey,
  priceId,
  companyId,
  userId,
  plan,
  existingCustomerId,
  requestId,
}: {
  apiKey: string
  priceId: string
  companyId: string
  userId: string
  plan: string
  existingCustomerId?: string | null
  requestId: string
}) {
  const payload: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    collection_mode: 'automatic',
    custom_data: {
      company_id: companyId,
      user_id: userId,
      plan,
    },
    checkout: {
      url: getSafeReturnUrl('success'),
    },
  }

  if (existingCustomerId) {
    payload.customer_id = existingCustomerId
  }

  const response = await fetch(`${getPaddleApiBaseUrl()}/transactions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({})) as {
    data?: { checkout?: { url?: string | null } }
    error?: { type?: string; code?: string; detail?: string }
  }

  const checkoutUrl = data.data?.checkout?.url ?? null
  if (!response.ok || !checkoutUrl) {
    safeLog('warn', 'Paddle checkout creation failed', {
      requestId,
      status: response.status,
      providerErrorType: data.error?.type ?? null,
      providerErrorCode: data.error?.code ?? null,
    })
    return null
  }

  return checkoutUrl
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
    const provider: BillingProvider = getConfiguredBillingProvider()

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

    if (provider !== 'paddle') {
      return jsonError('Paddle billing is not selected', 500, requestId)
    }

    const { data: existingCustomer } = await adminSupabase
      .from('billing_customers')
      .select('provider_customer_id')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .maybeSingle<BillingCustomerRow>()

    const checkoutUrl = await createPaddleCheckout({
      apiKey,
      priceId,
      companyId,
      userId: authData.user.id,
      plan,
      existingCustomerId: existingCustomer?.provider_customer_id ?? null,
      requestId,
    })

    if (!checkoutUrl) {
      return jsonError('Could not create checkout session', 502, requestId)
    }

    safeLog('info', 'Checkout session created', { requestId, provider, companyId, plan })
    return NextResponse.json({ url: checkoutUrl, requestId })
  } catch (error) {
    safeLog('error', 'Checkout route failed', {
      requestId,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError('Billing checkout failed', 500, requestId)
  }
}
