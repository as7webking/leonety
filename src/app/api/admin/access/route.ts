import { NextResponse } from 'next/server'
import { getAccountAccess } from '@/lib/account-access'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface ProfileRow {
  id: string
  email: string | null
  full_name: string | null
  created_at: string
}

interface CompanyRow {
  id: string
  owner_id: string
  name: string
}

interface AdminAccountRow {
  user_id: string
}

interface AppAccessRow {
  company_id: string
  tier: 'free' | 'starter' | 'pro' | 'business'
  manual_override: boolean
  active: boolean
  expires_at: string | null
}

interface AuthUserStatus {
  id: string
  email?: string | null
  confirmed_at?: string | null
  email_confirmed_at?: string | null
  banned_until?: string | null
  last_sign_in_at?: string | null
  created_at?: string | null
}

interface UpgradeRequestRow {
  id: string
  user_id: string
  company_id: string
  requested_plan: 'pro'
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  created_at: string
  company_name?: string
  user_email?: string
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

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date)
  nextDate.setMonth(nextDate.getMonth() + months)
  return nextDate
}

function isActiveAppAccess(access: AppAccessRow | undefined) {
  if (!access || !access.active || access.tier === 'free') {
    return false
  }

  return !access.expires_at || new Date(access.expires_at) > new Date()
}

async function recordAdminAuditEvent(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  adminUserId: string,
  targetUserId: string,
  action: string
) {
  const { error } = await adminSupabase
    .from('admin_audit_events')
    .insert({
      admin_user_id: adminUserId,
      target_user_id: targetUserId,
      action,
      created_at: new Date().toISOString(),
    })

  if (error && !['42P01', 'PGRST205'].includes(error.code ?? '')) {
    throw error
  }

  return !error
}

async function isCurrentUserAdmin(userId: string, email: string | undefined) {
  const fallbackAccess = getAccountAccess(email)
  if (fallbackAccess.isAdmin) {
    return true
  }

  const adminSupabase = createSupabaseAdminClient()
  const { data } = await adminSupabase
    .from('admin_accounts')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return Boolean(data)
}

async function loadManagedProfiles() {
  const adminSupabase = createSupabaseAdminClient()

  const [
    { data: profiles, error: profilesError },
    { data: companies, error: companiesError },
    { data: adminAccounts, error: adminsError },
    { data: appAccessRows, error: appAccessError },
    authUsersResponse,
  ] = await Promise.all([
    adminSupabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('companies')
      .select('id, owner_id, name')
      .order('created_at', { ascending: true }),
    adminSupabase
      .from('admin_accounts')
      .select('user_id'),
    adminSupabase
      .from('app_access')
      .select('company_id, tier, manual_override, active, expires_at'),
    adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch((error) => ({ data: { users: [] }, error })),
  ])

  if (profilesError) throw profilesError
  if (companiesError) throw companiesError
  if (adminsError) throw adminsError
  if (appAccessError) throw appAccessError
  if (authUsersResponse.error) {
    console.warn('Admin auth user listing unavailable; falling back to profiles table:', formatError(authUsersResponse.error))
  }

  const profilesById = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
  const companiesByOwner = new Map<string, CompanyRow[]>()
  for (const company of (companies ?? []) as CompanyRow[]) {
    companiesByOwner.set(company.owner_id, [
      ...(companiesByOwner.get(company.owner_id) ?? []),
      company,
    ])
  }

  const adminIds = new Set(((adminAccounts ?? []) as AdminAccountRow[]).map((admin) => admin.user_id))
  const appAccessByCompany = new Map(
    ((appAccessRows ?? []) as AppAccessRow[]).map((access) => [access.company_id, access])
  )
  const authUsersById = new Map(
    (authUsersResponse.data.users as AuthUserStatus[]).map((user) => [user.id, user])
  )
  const userIds = new Set([
    ...profilesById.keys(),
    ...authUsersById.keys(),
  ])

  return [...userIds].map((userId) => {
    const profile = profilesById.get(userId)
    const authUser = authUsersById.get(userId)
    const email = profile?.email ?? authUser?.email ?? ''
    const userCompanies = companiesByOwner.get(userId) ?? []
    const activeAccess = userCompanies
      .map((company) => appAccessByCompany.get(company.id))
      .find((access) => isActiveAppAccess(access))
    const fallbackAccess = getAccountAccess(email)
    const isAdmin = fallbackAccess.isAdmin || adminIds.has(userId)
    const isPro = fallbackAccess.plan === 'pro' || isActiveAppAccess(activeAccess)
    const subscriptionSource = activeAccess
      ? activeAccess.manual_override ? 'manual' : 'payment'
      : fallbackAccess.overrideSource
    const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null

    return {
      id: userId,
      email,
      full_name: profile?.full_name ?? '',
      created_at: profile?.created_at ?? authUser?.created_at ?? '',
      workspaceCount: userCompanies.length,
      workspaceNames: userCompanies.map((company) => company.name),
      isAdmin,
      isPro,
      plan: isPro ? 'pro' : 'free',
      subscriptionEndsAt: isPro ? activeAccess?.expires_at ?? null : null,
      subscriptionSource,
      subscriptionStatus: activeAccess
        ? isActiveAppAccess(activeAccess) ? 'active' : 'expired'
        : 'active',
      emailConfirmed: Boolean(authUser?.email_confirmed_at ?? authUser?.confirmed_at),
      isDeactivated: Boolean(bannedUntil && bannedUntil > new Date()),
      lastSignInAt: authUser?.last_sign_in_at ?? null,
    }
  })
}

async function loadUpgradeRequests() {
  const adminSupabase = createSupabaseAdminClient()
  const { data, error } = await adminSupabase
    .from('upgrade_requests')
    .select('id, user_id, company_id, requested_plan, status, message, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code ?? '')) return []
    throw error
  }

  const requests = (data ?? []) as UpgradeRequestRow[]
  if (requests.length === 0) return []

  const userIds = [...new Set(requests.map((request) => request.user_id))]
  const companyIds = [...new Set(requests.map((request) => request.company_id))]
  const [{ data: profiles }, { data: companies }] = await Promise.all([
    adminSupabase.from('profiles').select('id, email').in('id', userIds),
    adminSupabase.from('companies').select('id, name').in('id', companyIds),
  ])
  const emailsByUser = new Map(((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [profile.id, profile.email ?? '']))
  const namesByCompany = new Map(((companies ?? []) as Array<{ id: string; name: string }>).map((company) => [company.id, company.name]))

  return requests.map((request) => ({
    ...request,
    user_email: emailsByUser.get(request.user_id) ?? '',
    company_name: namesByCompany.get(request.company_id) ?? '',
  }))
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const isAdmin = await isCurrentUserAdmin(authData.user.id, authData.user.email)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const [profiles, upgradeRequests] = await Promise.all([
      loadManagedProfiles(),
      loadUpgradeRequests(),
    ])
    return NextResponse.json({ profiles, upgradeRequests })
  } catch (error) {
    console.error('Admin access GET failed:', error)
    return NextResponse.json({ error: 'Failed to load managed profiles' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const isAdmin = await isCurrentUserAdmin(authData.user.id, authData.user.email)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : ''
    const makeAdminProvided = typeof body.makeAdmin === 'boolean'
    const makeProProvided = typeof body.makePro === 'boolean'
    const makeAdmin = makeAdminProvided ? Boolean(body.makeAdmin) : false
    const makePro = makeProProvided ? Boolean(body.makePro) : false
    const deactivateAccount = typeof body.deactivateAccount === 'boolean' ? body.deactivateAccount : null
    const upgradeRequestId = typeof body.upgradeRequestId === 'string' ? body.upgradeRequestId : ''
    const upgradeRequestStatus = body.upgradeRequestStatus === 'approved' || body.upgradeRequestStatus === 'rejected'
      ? body.upgradeRequestStatus as 'approved' | 'rejected'
      : null
    const adminEmailAction = body.adminEmailAction === 'confirm_email' || body.adminEmailAction === 'resend_confirmation'
      ? body.adminEmailAction as 'confirm_email' | 'resend_confirmation'
      : null
    const noExpiry = Boolean(body.noExpiry)
    const monthsPaid = Math.max(1, Math.min(120, Number(body.monthsPaid) || 1))

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user is required' }, { status: 400 })
    }

    const adminSupabase = createSupabaseAdminClient()
    let auditEventRecorded = true

    if (adminEmailAction) {
      const { data: targetUserData, error: targetUserError } = await adminSupabase.auth.admin.getUserById(targetUserId)
      if (targetUserError) throw targetUserError

      const targetEmail = targetUserData.user.email
      if (!targetEmail) {
        return NextResponse.json({ error: 'Target user email is missing' }, { status: 400 })
      }

      if (adminEmailAction === 'confirm_email') {
        const { error: confirmError } = await adminSupabase.auth.admin.updateUserById(targetUserId, {
          email_confirm: true,
        })

        if (confirmError) throw confirmError
        auditEventRecorded = await recordAdminAuditEvent(adminSupabase, authData.user.id, targetUserId, 'confirm_email')
      }

      if (adminEmailAction === 'resend_confirmation') {
        const { error: resendError } = await adminSupabase.auth.resend({
          type: 'signup',
          email: targetEmail,
        })

        if (resendError) throw resendError
        auditEventRecorded = await recordAdminAuditEvent(adminSupabase, authData.user.id, targetUserId, 'resend_confirmation')
      }
    }

    if (upgradeRequestId && upgradeRequestStatus) {
      const { error: requestUpdateError } = await adminSupabase
        .from('upgrade_requests')
        .update({
          status: upgradeRequestStatus,
          reviewed_at: new Date().toISOString(),
          reviewed_by: authData.user.id,
        })
        .eq('id', upgradeRequestId)

      if (requestUpdateError) throw requestUpdateError
    }

    if (deactivateAccount !== null) {
      if (targetUserId === authData.user.id) {
        return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
      }

      const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(targetUserId, {
        ban_duration: deactivateAccount ? '876000h' : 'none',
      })

      if (authUpdateError) throw authUpdateError
    }

    if (makeAdminProvided && makeAdmin) {
      const { data: profile, error: profileError } = await adminSupabase
        .from('profiles')
        .select('id, email')
        .eq('id', targetUserId)
        .maybeSingle()

      if (profileError) throw profileError

      const { data: targetUserData, error: targetUserError } = await adminSupabase.auth.admin.getUserById(targetUserId)
      if (targetUserError) throw targetUserError

      const targetEmail = profile?.email ?? targetUserData.user.email ?? ''

      if (!targetEmail) {
        return NextResponse.json({ error: 'Target user email is missing' }, { status: 400 })
      }

      const { error: adminError } = await adminSupabase
        .from('admin_accounts')
        .upsert({
          user_id: targetUserId,
          email: targetEmail,
        })

      if (adminError) throw adminError
    } else if (makeAdminProvided && targetUserId !== authData.user.id) {
      const { error: adminError } = await adminSupabase
        .from('admin_accounts')
        .delete()
        .eq('user_id', targetUserId)

      if (adminError) throw adminError
    }

    if (makeProProvided) {
      const { data: targetCompanies, error: companiesError } = await adminSupabase
        .from('companies')
        .select('id')
        .eq('owner_id', targetUserId)
        .order('created_at', { ascending: true })

      if (companiesError) throw companiesError

      const targetCompanyId = targetCompanies?.[0]?.id

      if (!targetCompanyId) {
        return NextResponse.json({ error: 'Target user has no workspace to update access for' }, { status: 400 })
      }

      const accessPayload = {
        tier: makePro ? 'pro' : 'free',
        manual_override: true,
        active: true,
        expires_at: makePro ? noExpiry ? null : addMonths(new Date(), monthsPaid).toISOString() : new Date().toISOString(),
        created_by: authData.user.id,
        updated_at: new Date().toISOString(),
      }

      const { data: existingAccessRows, error: existingAccessError } = await adminSupabase
        .from('app_access')
        .select('id')
        .eq('company_id', targetCompanyId)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (existingAccessError) throw existingAccessError

      const existingAccessId = existingAccessRows?.[0]?.id
      const accessResult = existingAccessId
        ? await adminSupabase
          .from('app_access')
          .update(accessPayload)
          .eq('id', existingAccessId)
        : await adminSupabase
          .from('app_access')
          .insert({
            ...accessPayload,
            company_id: targetCompanyId,
          })

      if (accessResult.error) throw accessResult.error
    }

    const [profiles, upgradeRequests] = await Promise.all([
      loadManagedProfiles(),
      loadUpgradeRequests(),
    ])
    return NextResponse.json({ profiles, upgradeRequests, auditEventRecorded })
  } catch (error) {
    console.error('Admin access POST failed:', error)
    return NextResponse.json({ error: formatError(error) || 'Failed to update access' }, { status: 500 })
  }
}
