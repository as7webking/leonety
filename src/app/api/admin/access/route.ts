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
  banned_until?: string | null
  last_sign_in_at?: string | null
  created_at?: string | null
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
    adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (profilesError) throw profilesError
  if (companiesError) throw companiesError
  if (adminsError) throw adminsError
  if (appAccessError) throw appAccessError
  if (authUsersResponse.error) throw authUsersResponse.error

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
      subscriptionSource: activeAccess?.manual_override ? 'manual' : fallbackAccess.overrideSource,
      subscriptionStatus: activeAccess
        ? isActiveAppAccess(activeAccess) ? 'active' : 'expired'
        : 'active',
      isDeactivated: Boolean(bannedUntil && bannedUntil > new Date()),
      lastSignInAt: authUser?.last_sign_in_at ?? null,
    }
  })
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

    const profiles = await loadManagedProfiles()
    return NextResponse.json({ profiles })
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
    const makeAdmin = Boolean(body.makeAdmin)
    const makePro = Boolean(body.makePro)
    const deactivateAccount = typeof body.deactivateAccount === 'boolean' ? body.deactivateAccount : null
    const monthsPaid = Math.max(1, Math.min(120, Number(body.monthsPaid) || 1))

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user is required' }, { status: 400 })
    }

    const adminSupabase = createSupabaseAdminClient()

    if (deactivateAccount !== null) {
      if (targetUserId === authData.user.id) {
        return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
      }

      const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(targetUserId, {
        ban_duration: deactivateAccount ? '876000h' : 'none',
      })

      if (authUpdateError) throw authUpdateError
    }

    if (makeAdmin) {
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
    } else if (targetUserId !== authData.user.id) {
      const { error: adminError } = await adminSupabase
        .from('admin_accounts')
        .delete()
        .eq('user_id', targetUserId)

      if (adminError) throw adminError
    }

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

    const { error: accessError } = await adminSupabase
      .from('app_access')
      .upsert({
        company_id: targetCompanyId,
        tier: makePro ? 'pro' : 'free',
        manual_override: true,
        active: true,
        expires_at: makePro ? addMonths(new Date(), monthsPaid).toISOString() : new Date().toISOString(),
        created_by: authData.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' })

    if (accessError) throw accessError

    const profiles = await loadManagedProfiles()
    return NextResponse.json({ profiles })
  } catch (error) {
    console.error('Admin access POST failed:', error)
    return NextResponse.json({ error: formatError(error) || 'Failed to update access' }, { status: 500 })
  }
}
