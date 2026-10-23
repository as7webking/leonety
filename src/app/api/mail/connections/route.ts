import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { encryptMailboxConfig, getMailboxEntitlement, publicMailboxConnection, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace, createLimitedMailboxConnection } from '@/lib/mailbox/server'
import { testImapSmtpConfig } from '@/lib/mailbox/imap-provider'
import { getImapInputError, imapInputSchema } from '@/lib/mailbox/validation'
import { freeMailboxIdentityError, getVerifiedCanonicalAuthEmail } from '@/lib/mailbox/free-account'
import { logMailboxFailure } from '@/lib/mailbox/diagnostics'
import { MailboxProviderError } from '@/lib/mailbox/types'
import { firstMailboxTestFailure } from '@/lib/mailbox/connection-diagnostics'

export const runtime = 'nodejs'

async function getUser() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()
  return error ? null : data.user
}

export async function GET(request: Request) {
  let stage = 'authentication'
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    stage = 'workspace_authorization'
    const owned = await requireOwnedMailboxWorkspace(companyId, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    stage = 'entitlement_resolution'
    const entitlement = await getMailboxEntitlement(companyId, user.id, user)
    stage = 'connection_reconciliation'
    const rows = await reconcileMailboxDowngrade(companyId, entitlement.limit)
    const activeCount = rows.filter((row) => ['connected', 'reconnect_required', 'error'].includes(row.status)).length
    return NextResponse.json({
      connections: rows.map(publicMailboxConnection),
      plan: entitlement.plan,
      limit: entitlement.limit,
      activeCount,
      canConnect: activeCount < entitlement.limit,
      freeEmailReady: entitlement.freeEmailReady,
      canonicalVerifiedEmail: getVerifiedCanonicalAuthEmail(user),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'workspace_access_denied') {
      return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    }
    logMailboxFailure('connections.get', stage, error)
    return NextResponse.json({ error: 'mailbox_load_failed' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    const parsed = imapInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json(getImapInputError(parsed.error), { status: 400 })
    const input = parsed.data
    const owned = await requireOwnedMailboxWorkspace(input.companyId, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    const entitlement = await getMailboxEntitlement(input.companyId, user.id, user)
    const identityRestriction = freeMailboxIdentityError(entitlement.plan, user, input.email)
    if (identityRestriction) return NextResponse.json({ error: identityRestriction }, { status: 403 })
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
    const testResults = await testImapSmtpConfig(config)
    const testFailure = firstMailboxTestFailure(testResults)
    if (testFailure) {
      return NextResponse.json({ ...testFailure, ...testResults }, {
        status: 422,
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
    const encryptedConfig = encryptMailboxConfig(config)
    const id = await createLimitedMailboxConnection({
      companyId: input.companyId, limit: entitlement.limit, provider: 'imap',
      email: config.address, displayName: config.displayName || null,
      encryptedConfig,
    })
    return NextResponse.json({ id, connected: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    const diagnosticCodes = ['invalid_host', 'server_unreachable', 'connection_timeout', 'tls_certificate_failure', 'authentication_rejected', 'imap_authentication_rejected', 'smtp_authentication_rejected', 'provider_unavailable']
    const error = message.includes('mailbox_limit_reached') ? 'mailbox_limit_reached'
      : caught instanceof MailboxProviderError && diagnosticCodes.includes(caught.code) ? caught.code
        : message.includes('mailbox_secret_not_encrypted') ? 'mailbox_configuration_missing'
          : 'mailbox_connection_test_failed'
    return NextResponse.json({ error }, { status: error === 'mailbox_limit_reached' ? 409 : 400 })
  }
}
