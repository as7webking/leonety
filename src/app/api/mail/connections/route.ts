import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { encryptMailboxConfig, getMailboxEntitlement, publicMailboxConnection, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace, createLimitedMailboxConnection } from '@/lib/mailbox/server'
import { ImapSmtpMailboxProvider } from '@/lib/mailbox/imap-provider'
import type { MailboxConnectionRecord } from '@/lib/mailbox/types'
import { imapInputSchema } from '@/lib/mailbox/validation'

export const runtime = 'nodejs'

async function getUser() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()
  return error ? null : data.user
}

export async function GET(request: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const owned = await requireOwnedMailboxWorkspace(companyId, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    const entitlement = await getMailboxEntitlement(companyId, user.id, user.email)
    const rows = await reconcileMailboxDowngrade(companyId, entitlement.limit)
    const activeCount = rows.filter((row) => ['connected', 'reconnect_required', 'error'].includes(row.status)).length
    return NextResponse.json({
      connections: rows.map(publicMailboxConnection),
      plan: entitlement.plan,
      limit: entitlement.limit,
      activeCount,
      canConnect: activeCount < entitlement.limit,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'mailbox_load_failed' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    const parsed = imapInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'invalid_mailbox_settings' }, { status: 400 })
    const input = parsed.data
    const owned = await requireOwnedMailboxWorkspace(input.companyId, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    const entitlement = await getMailboxEntitlement(input.companyId, user.id, user.email)
    const connections = await reconcileMailboxDowngrade(input.companyId, entitlement.limit)
    const activeCount = connections.filter((connection) => ['connected', 'reconnect_required', 'error'].includes(connection.status)).length
    if (activeCount >= entitlement.limit) {
      return NextResponse.json({ error: 'mailbox_limit_reached', limit: entitlement.limit }, { status: 409 })
    }
    const config = {
      address: input.email.toLowerCase(), displayName: input.displayName,
      imapHost: input.imapHost, imapPort: input.imapPort,
      smtpHost: input.smtpHost, smtpPort: input.smtpPort,
      username: input.username, password: input.password,
    }
    const encryptedConfig = encryptMailboxConfig(config)
    const testConnection = new ImapSmtpMailboxProvider({
      id: 'validation', company_id: input.companyId, provider: 'imap',
      provider_account_email: config.address, display_name: config.displayName || null,
      provider_account_id: null, access_token_encrypted: null, refresh_token_encrypted: null,
      access_token_expires_at: null, granted_scopes: [], credentials_encrypted: encryptedConfig,
      status: 'connected', created_at: new Date().toISOString(),
      last_successful_connection_at: null, last_error_code: null,
    } satisfies MailboxConnectionRecord)
    await testConnection.testConnection()
    const id = await createLimitedMailboxConnection({
      companyId: input.companyId, limit: entitlement.limit, provider: 'imap',
      email: config.address, displayName: config.displayName || null,
      encryptedConfig,
    })
    return NextResponse.json({ id, connected: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    const error = message.includes('mailbox_limit_reached') ? 'mailbox_limit_reached'
      : message === 'invalid_message' ? 'mailbox_server_rejected'
        : message.includes('mailbox_secret_not_encrypted') ? 'mailbox_configuration_missing'
          : 'mailbox_connection_test_failed'
    return NextResponse.json({ error }, { status: error === 'mailbox_limit_reached' ? 409 : 400 })
  }
}
