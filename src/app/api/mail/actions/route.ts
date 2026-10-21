import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createMailboxProvider, recordMailboxUse } from '@/lib/mailbox/provider'
import { getMailboxConnection, getMailboxEntitlement, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace, updateMailboxConnection } from '@/lib/mailbox/server'
import { MailboxProviderError, type MailboxFolder } from '@/lib/mailbox/types'

export const runtime = 'nodejs'

const action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_read'), companyId: z.string().uuid(), connectionId: z.string().uuid(),
    folder: z.enum(['inbox', 'sent']), messageId: z.string().min(1).max(1200), read: z.boolean(),
  }),
  z.object({
    action: z.enum(['send', 'reply']), companyId: z.string().uuid(), connectionId: z.string().uuid(),
    to: z.array(z.string().email().max(320)).min(1).max(20),
    cc: z.array(z.string().email().max(320)).max(20).optional(),
    subject: z.string().max(998), text: z.string().min(1).max(50_000),
    replyToMessageId: z.string().max(1200).optional(),
  }),
])

export async function POST(request: Request) {
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const parsed = action.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const input = parsed.data
  const owned = await requireOwnedMailboxWorkspace(input.companyId, user.id)
  if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
  try {
    const entitlement = await getMailboxEntitlement(input.companyId, user.id, user)
    await reconcileMailboxDowngrade(input.companyId, entitlement.limit)
    const connection = await getMailboxConnection(input.companyId, input.connectionId)
    if (!connection || connection.status !== 'connected') return NextResponse.json({ error: 'mailbox_not_connected' }, { status: 409 })
    const provider = await createMailboxProvider(connection)
    if (input.action === 'mark_read') {
      await provider.setRead(input.folder as MailboxFolder, input.messageId, input.read)
    } else if (input.action === 'reply') {
      if (!input.replyToMessageId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
      await provider.reply({ ...input, replyToMessageId: input.replyToMessageId })
    } else {
      await provider.sendMessage(input)
    }
    await recordMailboxUse(connection)
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (caught) {
    const code = caught instanceof MailboxProviderError ? caught.code
      : caught instanceof Error && ['reconnect_required', 'missing_scope', 'rate_limited', 'provider_unavailable'].includes(caught.message)
        ? caught.message : 'mailbox_provider_error'
    if (code === 'reconnect_required' || code === 'missing_scope') {
      await updateMailboxConnection(input.companyId, input.connectionId, { status: 'reconnect_required', last_error_code: code === 'missing_scope' ? 'missing_scope' : 'authorization_revoked' }).catch(() => undefined)
    }
    return NextResponse.json({ error: code }, { status: code === 'reconnect_required' ? 409 : code === 'rate_limited' ? 429 : 502 })
  }
}
