import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createMailboxProvider, recordMailboxUse } from '@/lib/mailbox/provider'
import { getMailboxConnection, getMailboxEntitlement, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace, updateMailboxConnection } from '@/lib/mailbox/server'
import { MailboxProviderError } from '@/lib/mailbox/types'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const companyId = params.get('companyId') ?? ''
  const connectionId = params.get('connectionId') ?? ''
  const id = params.get('id') ?? ''
  const expectedProvider = params.get('provider')
  const folder = params.get('folder') === 'sent' ? 'sent' : 'inbox'
  if (!id || id.length > 1200 || !['google', 'microsoft', 'imap'].includes(expectedProvider ?? '')) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const owned = await requireOwnedMailboxWorkspace(companyId, user.id)
  if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
  try {
    const entitlement = await getMailboxEntitlement(companyId, user.id, user)
    await reconcileMailboxDowngrade(companyId, entitlement.limit)
    const connection = await getMailboxConnection(companyId, connectionId)
    if (!connection || connection.status !== 'connected') return NextResponse.json({ error: 'mailbox_not_connected' }, { status: 409 })
    if (expectedProvider && expectedProvider !== connection.provider) return NextResponse.json({ error: 'message_identity_mismatch' }, { status: 400 })
    const provider = await createMailboxProvider(connection)
    const message = await provider.getMessage(folder, id)
    await recordMailboxUse(connection)
    return NextResponse.json({ message }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof MailboxProviderError && caught.code === 'reconnect_required') {
      await updateMailboxConnection(companyId, connectionId, {
        status: 'reconnect_required', last_error_code: 'authorization_revoked',
      }).catch(() => undefined)
    }
    const code = caught instanceof MailboxProviderError ? caught.code : 'mailbox_provider_error'
    if (code === 'message_not_found' || code === 'invalid_message') {
      return NextResponse.json({ error: 'message_not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    }
    return NextResponse.json({ error: code }, { status: code === 'reconnect_required' ? 409 : code === 'rate_limited' ? 429 : 502 })
  }
}
