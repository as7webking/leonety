import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createMailboxProvider } from '@/lib/mailbox/provider'
import { getMailboxConnection, getMailboxEntitlement, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace, updateMailboxConnection } from '@/lib/mailbox/server'
import { MailboxProviderError } from '@/lib/mailbox/types'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await context.params
  const body = await request.json().catch(() => null) as { companyId?: unknown } | null
  const parsed = z.string().uuid().safeParse(body?.companyId)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  try {
    const owned = await requireOwnedMailboxWorkspace(parsed.data, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    const entitlement = await getMailboxEntitlement(parsed.data, user.id, user)
    await reconcileMailboxDowngrade(parsed.data, entitlement.limit)
    const connection = await getMailboxConnection(parsed.data, connectionId)
    if (!connection || connection.status !== 'connected') return NextResponse.json({ error: 'mailbox_not_connected' }, { status: 409 })
    const provider = await createMailboxProvider(connection)
    await provider.testConnection()
    await updateMailboxConnection(parsed.data, connectionId, {
      last_successful_connection_at: new Date().toISOString(), last_error_code: null,
    })
    return NextResponse.json({ success: true })
  } catch (caught) {
    const code = caught instanceof MailboxProviderError ? caught.code : 'mailbox_test_failed'
    if (code === 'reconnect_required' || code === 'missing_scope') {
      await updateMailboxConnection(parsed.data, connectionId, {
        status: 'reconnect_required', last_error_code: code === 'missing_scope' ? 'missing_scope' : 'authorization_revoked',
      }).catch(() => undefined)
    }
    return NextResponse.json({ error: code }, { status: code === 'reconnect_required' ? 409 : 502 })
  }
}
