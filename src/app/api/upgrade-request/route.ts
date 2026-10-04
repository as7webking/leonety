import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getPlanRank } from '@/lib/billing/plans'
import { getEmailRuntimeConfig } from '@/lib/email/config'
import { sendEmail } from '@/lib/email/send-email'
import { buildUpgradeRequestEmail } from '@/lib/email/templates/upgrade-request'
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface CompanyRow {
  id: string
  name: string
}

interface AppAccessRow {
  company_id: string
  tier: 'free' | 'starter' | 'pro' | 'business'
  manual_override: boolean
  active: boolean
  expires_at: string | null
}

interface UpgradeRequestRow {
  id: string
  user_id: string
  company_id: string
  requested_plan: 'pro'
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string }
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code ? `Code: ${maybeError.code}` : '']
      .filter(Boolean)
      .join(' · ')
  }

  return 'Unknown error'
}

function isActivePaidAccess(access: AppAccessRow | undefined) {
  if (!access || !access.active || getPlanRank(access.tier) === 0) {
    return false
  }

  return !access.expires_at || new Date(access.expires_at) > new Date()
}

async function loadUpgradeContext(userId: string) {
  const adminSupabase = createSupabaseAdminClient()

  const { data: companies, error: companiesError } = await adminSupabase
    .from('companies')
    .select('id, name')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  if (companiesError) throw companiesError

  const company = ((companies ?? []) as CompanyRow[])[0] ?? null
  if (!company) {
    return {
      company: null,
      currentPlan: 'free' as const,
      pendingRequest: null,
      isPro: false,
    }
  }

  const [{ data: accessRows, error: accessError }, { data: pendingRequest, error: requestError }] = await Promise.all([
    adminSupabase
      .from('app_access')
      .select('company_id, tier, manual_override, active, expires_at')
      .eq('company_id', company.id),
    adminSupabase
      .from('upgrade_requests')
      .select('id, user_id, company_id, requested_plan, status, message, created_at, reviewed_at, reviewed_by')
      .eq('user_id', userId)
      .eq('company_id', company.id)
      .eq('requested_plan', 'pro')
      .eq('status', 'pending')
      .maybeSingle<UpgradeRequestRow>(),
  ])

  if (accessError) throw accessError
  if (requestError) throw requestError

  const activeAccess = ((accessRows ?? []) as AppAccessRow[])
    .filter((access) => access.active)
    .sort((left, right) => getPlanRank(right.tier) - getPlanRank(left.tier))[0]
  const isPro = isActivePaidAccess(activeAccess)

  return {
    company,
    currentPlan: isPro ? activeAccess?.tier ?? 'pro' as const : activeAccess?.tier ?? 'free' as const,
    pendingRequest: pendingRequest ?? null,
    isPro,
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const context = await loadUpgradeContext(authData.user.id)
    return NextResponse.json(context)
  } catch (error) {
    console.error('Upgrade request GET failed:', error)
    return NextResponse.json({ error: formatError(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const context = await loadUpgradeContext(authData.user.id)
    if (!context.company) {
      return NextResponse.json({ error: 'Create a workspace before requesting Pro access.' }, { status: 400 })
    }

    if (context.isPro) {
      return NextResponse.json(context)
    }

    if (context.pendingRequest) {
      return NextResponse.json(context)
    }

    const body = await request.json().catch(() => ({}))
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : null
    const adminSupabase = createSupabaseAdminClient()

    const { data: createdRequest, error: insertError } = await adminSupabase
      .from('upgrade_requests')
      .insert({
        user_id: authData.user.id,
        company_id: context.company.id,
        requested_plan: 'pro',
        status: 'pending',
        message,
      })
      .select('id, created_at')
      .single<{ id: string; created_at: string }>()

    if (insertError) throw insertError

    const recipient = process.env.UPGRADE_REQUEST_ADMIN_EMAIL?.trim()
    const runtime = getEmailRuntimeConfig()
    let emailNotification: { status: 'sent' } | { status: 'failed'; code: string }

    if (!recipient || !runtime.ok) {
      emailNotification = { status: 'failed', code: 'configuration_missing' }
    } else {
      const cookieStore = await cookies()
      const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value)
      const template = buildUpgradeRequestEmail({
        locale,
        productName: runtime.config.productName,
        appUrl: runtime.config.appUrl,
        requesterEmail: authData.user.email ?? 'Unknown',
        companyName: context.company.name,
        requestedPlan: 'Pro',
        createdAt: createdRequest.created_at,
        message,
      })
      const delivery = await sendEmail({
        to: recipient,
        subject: template.subject,
        html: template.html,
        text: template.text,
        category: 'upgrade_request',
        idempotencyKey: `upgrade-request/${createdRequest.id}`,
      })
      emailNotification = delivery.ok
        ? { status: 'sent' }
        : { status: 'failed', code: delivery.code }
    }

    if (emailNotification.status === 'failed') {
      console.warn('[upgrade-request] Request saved but email notification failed', {
        requestId: createdRequest.id,
        code: emailNotification.code,
      })
    }

    const nextContext = await loadUpgradeContext(authData.user.id)
    return NextResponse.json({
      ...nextContext,
      message: emailNotification.status === 'sent'
        ? 'Your Pro request has been saved and the review team was notified.'
        : 'Your Pro request has been saved, but the email notification could not be sent.',
      emailNotification,
    })
  } catch (error) {
    console.error('Upgrade request POST failed:', error)
    return NextResponse.json({ error: formatError(error) }, { status: 500 })
  }
}
