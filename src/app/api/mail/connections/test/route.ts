import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getMailboxEntitlement, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace } from '@/lib/mailbox/server'
import { imapInputSchema } from '@/lib/mailbox/validation'
import { testImapSmtpConfig } from '@/lib/mailbox/imap-provider'
import { freeMailboxIdentityError } from '@/lib/mailbox/free-account'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const parsed = imapInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_mailbox_settings' }, { status: 400 })
  const input = parsed.data
  if (!(await requireOwnedMailboxWorkspace(input.companyId, user.id))) {
    return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
  }
  const entitlement = await getMailboxEntitlement(input.companyId, user.id, user)
  const identityRestriction = freeMailboxIdentityError(entitlement.plan, user, input.email)
  if (identityRestriction) return NextResponse.json({ error: identityRestriction }, { status: 403 })
  const connections = await reconcileMailboxDowngrade(input.companyId, entitlement.limit)
  const activeCount = connections.filter((connection) => ['connected', 'reconnect_required', 'error'].includes(connection.status)).length
  if (activeCount >= entitlement.limit) return NextResponse.json({ error: 'mailbox_limit_reached', limit: entitlement.limit }, { status: 409 })
  const results = await testImapSmtpConfig({
    address: input.email.toLowerCase(), displayName: input.displayName,
    imapHost: input.imapHost, imapPort: input.imapPort,
    smtpHost: input.smtpHost, smtpPort: input.smtpPort,
    username: input.username, password: input.password,
  })
  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
