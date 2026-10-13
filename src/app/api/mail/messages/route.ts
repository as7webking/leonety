import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createMailboxProvider, recordMailboxUse } from '@/lib/mailbox/provider'
import { getMailboxConnection, getMailboxEntitlement, listMailboxConnections, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace, updateMailboxConnection } from '@/lib/mailbox/server'
import { MailboxProviderError } from '@/lib/mailbox/types'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const companyId = params.get('companyId') ?? ''
  const connectionId = params.get('connectionId') ?? ''
  const folder = params.get('folder') === 'sent' ? 'sent' : 'inbox'
  const filter = params.get('filter') === 'unread' && folder === 'inbox' ? 'unread' : 'all'
  const cursor = params.get('cursor')
  const owned = await requireOwnedMailboxWorkspace(companyId, user.id)
  if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
  try {
    const entitlement = await getMailboxEntitlement(companyId, user.id, user)
    await reconcileMailboxDowngrade(companyId, entitlement.limit)
    if (connectionId === 'all') {
      const connections = (await listMailboxConnections(companyId)).filter((connection) => connection.status === 'connected')
      const cursors = cursor ? decodeAllCursor(cursor) : {}
      const pages = await Promise.all(connections.map(async (connection) => {
        const mailboxCursor = cursors[connection.id]
        if (mailboxCursor === '') return { messages: [], nextCursor: '', failed: false, id: connection.id }
        try {
          const provider = await createMailboxProvider(connection)
          const page = await provider.listMessages(folder, mailboxCursor ?? null, 10, filter)
          await recordMailboxUse(connection)
          return { messages: page.messages, nextCursor: page.nextCursor ?? '', failed: false, id: connection.id }
        } catch (caught) {
          if (caught instanceof MailboxProviderError && caught.code === 'reconnect_required') {
            await updateMailboxConnection(companyId, connection.id, {
              status: 'reconnect_required', last_error_code: 'authorization_revoked',
            }).catch(() => undefined)
          }
          return { messages: [], nextCursor: mailboxCursor ?? '', failed: true, id: connection.id }
        }
      }))
      const messages = pages.flatMap((page) => page.messages)
        .sort((left, right) => Date.parse(right.receivedAt ?? '') - Date.parse(left.receivedAt ?? ''))
      const nextByMailbox = Object.fromEntries(pages.flatMap((page) => 'id' in page ? [[page.id, page.nextCursor]] : []))
      const hasMore = Object.values(nextByMailbox).some(Boolean)
      return NextResponse.json({ messages, nextCursor: hasMore ? encodeAllCursor(nextByMailbox) : null, failedMailboxCount: pages.filter((page) => page.failed).length }, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
    const connection = await getMailboxConnection(companyId, connectionId)
    if (!connection) return NextResponse.json({ error: 'mailbox_not_found' }, { status: 404 })
    if (connection.status !== 'connected') return NextResponse.json({ error: 'mailbox_not_connected' }, { status: 409 })
    const provider = await createMailboxProvider(connection)
    const page = await provider.listMessages(folder, cursor, 20, filter)
    await recordMailboxUse(connection)
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof MailboxProviderError && caught.code === 'reconnect_required') {
      await updateMailboxConnection(companyId, connectionId, {
        status: 'reconnect_required', last_error_code: 'authorization_revoked',
      }).catch(() => undefined)
    }
    return providerError(caught)
  }
}

function decodeAllCursor(value: string) {
  if (value.length > 12_000) throw new MailboxProviderError('invalid_message')
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length > 4 || entries.some(([id, cursor]) => !/^[0-9a-f-]{36}$/i.test(id) || (cursor !== '' && (typeof cursor !== 'string' || cursor.length > 4000)))) throw new Error()
    return parsed as Record<string, string>
  } catch {
    throw new MailboxProviderError('invalid_message')
  }
}

function encodeAllCursor(value: Record<string, string>) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function providerError(error: unknown) {
  const code = error instanceof MailboxProviderError ? error.code
    : error instanceof Error && ['reconnect_required', 'provider_rate_limited', 'provider_unavailable'].includes(error.message)
      ? error.message : 'mailbox_provider_error'
  return NextResponse.json({ error: code }, { status: code === 'reconnect_required' ? 409 : code === 'rate_limited' ? 429 : 502 })
}
