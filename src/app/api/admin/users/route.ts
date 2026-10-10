import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { isLeonetyOperatorAdmin } from '@/lib/admin-authorization'
import {
  escapePostgresLikePattern,
  getAdminUserActivityStatus,
  getAdminUserStatus,
  getSafeAuthProvider,
  normalizeAdminUsersPage,
  normalizeAdminUsersPageSize,
  normalizeAdminUsersSearch,
} from '@/lib/admin-user-directory'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface ProfileRow {
  id: string
  email: string | null
  full_name: string | null
  created_at: string | null
}

interface CompanyRow {
  id: string
  owner_id: string
  name: string
  created_at: string | null
}

async function authenticateOperator() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) return { user: null, status: 401 as const }
  if (!await isLeonetyOperatorAdmin(data.user)) return { user: null, status: 403 as const }
  return { user: data.user, status: 200 as const }
}

async function getProfileSearchMatches(search: string) {
  if (!search) return new Set<string>()

  const adminSupabase = createSupabaseAdminClient()
  const pattern = `%${escapePostgresLikePattern(search)}%`
  const [nameResponse, emailResponse] = await Promise.all([
    adminSupabase.from('profiles').select('id').ilike('full_name', pattern).limit(1000),
    adminSupabase.from('profiles').select('id').ilike('email', pattern).limit(1000),
  ])

  if (nameResponse.error) throw nameResponse.error
  if (emailResponse.error) throw emailResponse.error

  return new Set([
    ...(nameResponse.data ?? []).map((profile) => profile.id),
    ...(emailResponse.data ?? []).map((profile) => profile.id),
  ])
}

async function listAllAuthUsers() {
  const adminSupabase = createSupabaseAdminClient()
  const perPage = 1000
  const users: User[] = []
  let page = 1

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    users.push(...data.users)

    if (data.users.length < perPage || (data.total > 0 && users.length >= data.total)) break
    page += 1
  }

  return users
}

async function listDirectoryUsers(page: number, pageSize: number, search: string) {
  const adminSupabase = createSupabaseAdminClient()

  if (!search) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: pageSize })
    if (error) throw error
    return { users: data.users, total: data.total || data.users.length }
  }

  const [authUsers, matchingProfileIds] = await Promise.all([
    listAllAuthUsers(),
    getProfileSearchMatches(search),
  ])
  const normalizedSearch = search.toLocaleLowerCase()
  const matches = authUsers.filter((user) => (
    user.email?.toLocaleLowerCase().includes(normalizedSearch)
    || matchingProfileIds.has(user.id)
  ))
  const offset = (page - 1) * pageSize

  return {
    users: matches.slice(offset, offset + pageSize),
    total: matches.length,
  }
}

async function loadDirectoryPage(page: number, pageSize: number, search: string) {
  const adminSupabase = createSupabaseAdminClient()
  const directory = await listDirectoryUsers(page, pageSize, search)
  const userIds = directory.users.map((user) => user.id)

  if (userIds.length === 0) {
    return { users: [], total: directory.total, activityTrackingAvailable: false }
  }

  const [
    { data: profiles, error: profilesError },
    { data: companies, error: companiesError },
    { data: activityRows, error: activityError },
  ] = await Promise.all([
    adminSupabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .in('id', userIds),
    adminSupabase
      .from('companies')
      .select('id, owner_id, name, created_at')
      .in('owner_id', userIds)
      .order('created_at', { ascending: true }),
    adminSupabase
      .from('user_activity')
      .select('user_id, last_activity_at')
      .in('user_id', userIds),
  ])

  if (profilesError) throw profilesError
  if (companiesError) throw companiesError
  if (activityError) {
    console.warn('[admin.users] activity_unavailable', {
      code: activityError.code ?? 'unknown',
    })
  }

  const profilesById = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
  const activityByUser = new Map((activityRows ?? []).map((row) => [row.user_id, row.last_activity_at]))
  const companiesByOwner = new Map<string, CompanyRow[]>()
  for (const company of (companies ?? []) as CompanyRow[]) {
    companiesByOwner.set(company.owner_id, [...(companiesByOwner.get(company.owner_id) ?? []), company])
  }

  return {
    total: directory.total,
    activityTrackingAvailable: !activityError,
    users: directory.users.map((user) => {
      const profile = profilesById.get(user.id)
      const workspaces = companiesByOwner.get(user.id) ?? []
      const lastActivityAt = activityByUser.get(user.id) ?? null
      const emailConfirmed = Boolean(user.email_confirmed_at ?? user.confirmed_at)

      return {
        id: user.id,
        accountExists: true,
        email: user.email ?? profile?.email ?? '',
        displayName: profile?.full_name ?? '',
        registeredAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        lastActivityAt,
        activityStatus: getAdminUserActivityStatus({
          lastActivityAt,
          trackingAvailable: !activityError,
        }),
        provider: getSafeAuthProvider(user.app_metadata),
        status: getAdminUserStatus({ emailConfirmed, bannedUntil: user.banned_until }),
        hasProfile: Boolean(profile),
        workspaceCount: workspaces.length,
        primaryWorkspace: workspaces[0]?.name ?? null,
      }
    }),
  }
}

async function loadConsistencySummary() {
  const adminSupabase = createSupabaseAdminClient()
  const [authUsers, profilesResponse, companiesResponse] = await Promise.all([
    listAllAuthUsers(),
    adminSupabase.from('profiles').select('id'),
    adminSupabase.from('companies').select('owner_id'),
  ])

  if (profilesResponse.error) throw profilesResponse.error
  if (companiesResponse.error) throw companiesResponse.error

  const authIds = new Set(authUsers.map((user) => user.id))
  const profileIds = new Set((profilesResponse.data ?? []).map((profile) => profile.id))
  const workspaceCounts = new Map<string, number>()
  for (const company of companiesResponse.data ?? []) {
    workspaceCounts.set(company.owner_id, (workspaceCounts.get(company.owner_id) ?? 0) + 1)
  }

  return {
    authUsersWithoutProfile: authUsers.filter((user) => !profileIds.has(user.id)).length,
    profilesWithoutAuthUser: [...profileIds].filter((profileId) => !authIds.has(profileId)).length,
    usersWithoutWorkspace: authUsers.filter((user) => (workspaceCounts.get(user.id) ?? 0) === 0).length,
    usersWithMultipleWorkspaces: authUsers.filter((user) => (workspaceCounts.get(user.id) ?? 0) > 1).length,
  }
}

export async function GET(request: Request) {
  try {
    const authentication = await authenticateOperator()
    if (!authentication.user) {
      return NextResponse.json(
        { error: authentication.status === 401 ? 'Not authenticated' : 'Admin access required' },
        { status: authentication.status },
      )
    }

    const url = new URL(request.url)
    if (url.searchParams.get('mode') === 'consistency') {
      return NextResponse.json({ consistency: await loadConsistencySummary() })
    }

    const page = normalizeAdminUsersPage(url.searchParams.get('page'))
    const pageSize = normalizeAdminUsersPageSize(url.searchParams.get('pageSize'))
    const search = normalizeAdminUsersSearch(url.searchParams.get('search'))
    const directory = await loadDirectoryPage(page, pageSize, search)
    const totalPages = Math.max(1, Math.ceil(directory.total / pageSize))

    return NextResponse.json({
      users: directory.users,
      activityTrackingAvailable: directory.activityTrackingAvailable,
      pagination: { page, pageSize, total: directory.total, totalPages },
      search,
    })
  } catch (error) {
    console.error('[admin.users] directory_failed', {
      category: error instanceof Error ? error.name : 'unknown_error',
    })
    return NextResponse.json({ error: 'Failed to load the user directory' }, { status: 500 })
  }
}
