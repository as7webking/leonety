import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { decryptSecret, encryptSecret, isEncryptedSecret } from '@/lib/credential-encryption'
import type { AppPlan } from '@/lib/billing/plans'
import { resolveAccountAccessForUser } from '@/lib/account-access-server'
import type { MailboxConnectionRecord, MailboxProviderId } from './types'
import { mailboxLimitForPlan } from '@/lib/mailbox-plan'

export const MAILBOX_PROVIDERS: MailboxProviderId[] = ['google', 'microsoft', 'imap']
export const MAILBOX_ACTIVE_STATUSES = ['connected', 'reconnect_required', 'error'] as const

export interface MailboxEntitlement {
  plan: AppPlan
  limit: number
  activeCount: number
}

const connectionColumns = [
  'id', 'company_id', 'provider', 'provider_account_email', 'display_name',
  'provider_account_id', 'access_token_encrypted', 'refresh_token_encrypted',
  'access_token_expires_at', 'granted_scopes', 'credentials_encrypted', 'status',
  'created_at', 'last_successful_connection_at', 'last_error_code',
].join(',')

export async function requireOwnedMailboxWorkspace(companyId: string, userId: string) {
  const admin = createSupabaseAdminClient()
  const { data: company, error } = await admin
    .from('companies')
    .select('id, owner_id')
    .eq('id', companyId)
    .maybeSingle<{ id: string; owner_id: string }>()
  if (error) throw error
  if (!company || company.owner_id !== userId) return null
  return { admin, company }
}

export async function getMailboxEntitlement(companyId: string, userId: string, email: string | null | undefined): Promise<MailboxEntitlement> {
  const access = await resolveAccountAccessForUser(userId, email)
  if (!access.companyIds.includes(companyId)) throw new Error('workspace_access_denied')
  const plan = access.accountAccess.plan
  const admin = createSupabaseAdminClient()
  const { count, error } = await admin.from('mailbox_connections')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', [...MAILBOX_ACTIVE_STATUSES])
  if (error) throw error
  return { plan, limit: mailboxLimitForPlan(plan), activeCount: count ?? 0 }
}

export async function listMailboxConnections(companyId: string) {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.from('mailbox_connections')
    .select(connectionColumns)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as MailboxConnectionRecord[]
}

export async function getMailboxConnection(companyId: string, connectionId: string) {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.from('mailbox_connections')
    .select(connectionColumns)
    .eq('company_id', companyId)
    .eq('id', connectionId)
    .maybeSingle()
  if (error) throw error
  return data as unknown as MailboxConnectionRecord | null
}

export async function reconcileMailboxDowngrade(companyId: string, limit: number) {
  const connections = await listMailboxConnections(companyId)
  const active = connections.filter((connection) =>
    connection.status === 'connected' || connection.status === 'reconnect_required' || connection.status === 'error'
  )
  const extras = active.slice(limit)
  if (!extras.length) return connections
  const admin = createSupabaseAdminClient()
  const { error } = await admin.from('mailbox_connections')
    .update({ status: 'plan_restricted', last_error_code: 'plan_limit' })
    .eq('company_id', companyId)
    .in('id', extras.map((connection) => connection.id))
  if (error) throw error
  return listMailboxConnections(companyId)
}

export function decryptMailboxSecret(value: string | null | undefined) {
  if (!value || !isEncryptedSecret(value)) {
    throw new Error('mailbox_secret_not_encrypted')
  }
  return decryptSecret(value)
}

export function encryptMailboxConfig(value: unknown) {
  return encryptSecret(JSON.stringify(value))
}

export function decryptMailboxConfig(value: string | null | undefined) {
  return JSON.parse(decryptMailboxSecret(value)) as Record<string, unknown>
}

export async function updateMailboxConnection(companyId: string, id: string, patch: Record<string, unknown>) {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.from('mailbox_connections')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .select(connectionColumns)
    .maybeSingle()
  if (error) throw error
  return data as unknown as MailboxConnectionRecord | null
}

export async function createLimitedMailboxConnection(input: {
  companyId: string
  limit: number
  provider: MailboxProviderId
  email: string
  displayName?: string | null
  providerAccountId?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  accessTokenExpiresAt?: string | null
  scopes?: string[]
  encryptedConfig?: string | null
}) {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('create_mailbox_connection_limited', {
    p_company_id: input.companyId,
    p_max_connections: input.limit,
    p_provider: input.provider,
    p_account_email: input.email,
    p_display_name: input.displayName ?? null,
    p_provider_account_id: input.providerAccountId ?? null,
    p_access_token_encrypted: input.accessToken ? encryptSecret(input.accessToken) : null,
    p_refresh_token_encrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    p_access_token_expires_at: input.accessTokenExpiresAt ?? null,
    p_granted_scopes: input.scopes ?? [],
    p_credentials_encrypted: input.encryptedConfig ?? null,
  })
  if (error) throw error
  return data as string
}

export function publicMailboxConnection(connection: MailboxConnectionRecord) {
  return {
    id: connection.id,
    provider: connection.provider,
    email: connection.provider_account_email,
    displayName: connection.display_name,
    status: connection.status,
    createdAt: connection.created_at,
    lastSuccessfulConnectionAt: connection.last_successful_connection_at,
  }
}
