import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getMailboxConnection, getMailboxEntitlement, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace, updateMailboxConnection } from '@/lib/mailbox/server'
import { createMailboxProvider } from '@/lib/mailbox/provider'

export const runtime = 'nodejs'

const actionSchema = z.object({ companyId: z.string().uuid(), action: z.enum(['activate', 'restrict']) })

export async function PATCH(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await context.params
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  try {
    const owned = await requireOwnedMailboxWorkspace(parsed.data.companyId, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    const entitlement = await getMailboxEntitlement(parsed.data.companyId, user.id, user.email)
    await reconcileMailboxDowngrade(parsed.data.companyId, entitlement.limit)
    const connection = await getMailboxConnection(parsed.data.companyId, connectionId)
    if (!connection) return NextResponse.json({ error: 'mailbox_not_found' }, { status: 404 })
    if (parsed.data.action === 'restrict') {
      if (connection.status === 'connected' || connection.status === 'error' || connection.status === 'reconnect_required') {
        await updateMailboxConnection(parsed.data.companyId, connectionId, { status: 'plan_restricted', last_error_code: 'plan_limit' })
      }
      return NextResponse.json({ updated: true })
    }
    if (connection.status !== 'plan_restricted') return NextResponse.json({ updated: true })
    const { data: activated, error: activationError } = await owned.admin.rpc('activate_mailbox_connection_limited', {
      p_company_id: parsed.data.companyId,
      p_connection_id: connectionId,
      p_max_connections: entitlement.limit,
    })
    if (activationError) {
      if (activationError.message.includes('mailbox_limit_reached')) return NextResponse.json({ error: 'mailbox_limit_reached' }, { status: 409 })
      throw activationError
    }
    if (!activated) return NextResponse.json({ error: 'mailbox_not_found' }, { status: 404 })
    return NextResponse.json({ updated: true })
  } catch {
    return NextResponse.json({ error: 'mailbox_update_failed' }, { status: 503 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await context.params
  const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
  if (!z.string().uuid().safeParse(companyId).success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  try {
    const owned = await requireOwnedMailboxWorkspace(companyId, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    const connection = await getMailboxConnection(companyId, connectionId)
    if (!connection) return NextResponse.json({ error: 'mailbox_not_found' }, { status: 404 })
    if (connection.status === 'connected') {
      try {
        const provider = await createMailboxProvider(connection)
        await provider.disconnect()
      } catch {
        // Local credential removal must continue even if provider revocation is unavailable.
      }
    }
    await updateMailboxConnection(companyId, connectionId, {
      status: 'disabled',
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      credentials_encrypted: null,
      access_token_expires_at: null,
      granted_scopes: [],
      last_error_code: null,
    })
    return NextResponse.json({ disconnected: true })
  } catch {
    return NextResponse.json({ error: 'mailbox_disconnect_failed' }, { status: 503 })
  }
}
