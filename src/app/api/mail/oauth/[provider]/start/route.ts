import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getMailboxEntitlement, reconcileMailboxDowngrade, requireOwnedMailboxWorkspace } from '@/lib/mailbox/server'
import { createMailboxOAuthState, getOAuthScopes, mailboxCallbackUrl, mailboxOAuthConfig } from '@/lib/mailbox/oauth'
import type { MailboxProviderId } from '@/lib/mailbox/types'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params
  if (rawProvider !== 'google' && rawProvider !== 'microsoft') {
    return NextResponse.json({ error: 'unsupported_provider' }, { status: 404 })
  }
  const provider = rawProvider as MailboxProviderId
  const url = new URL(request.url)
  const companyId = url.searchParams.get('companyId') ?? ''
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  try {
    const owned = await requireOwnedMailboxWorkspace(companyId, user.id)
    if (!owned) return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    const entitlement = await getMailboxEntitlement(companyId, user.id, user)
    const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || url.origin
    if (!entitlement.freeEmailReady) {
      return NextResponse.redirect(new URL('/app/settings/mailbox?mailError=free_email_required', base))
    }
    const connections = await reconcileMailboxDowngrade(companyId, entitlement.limit)
    const activeCount = connections.filter((connection) => ['connected', 'reconnect_required', 'error'].includes(connection.status)).length
    const reconnectable = connections.some((connection) =>
      connection.provider === provider && ['reconnect_required', 'error'].includes(connection.status)
    )
    if (activeCount >= entitlement.limit && !reconnectable) {
      return NextResponse.redirect(new URL('/app/settings/mailbox?mailError=limit', base))
    }
    const oauthProvider = provider as 'google' | 'microsoft'
    const { clientId } = mailboxOAuthConfig(oauthProvider)
    const redirectUri = mailboxCallbackUrl(provider)
    const state = await createMailboxOAuthState({ userId: user.id, companyId, provider })
    const scopes = getOAuthScopes(oauthProvider)
    const authorize = oauthProvider === 'google'
      ? new URL('https://accounts.google.com/o/oauth2/v2/auth')
      : new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    authorize.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: scopes.join(' '),
      state,
      ...(oauthProvider === 'google' ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'consent' }),
    }).toString()
    return NextResponse.redirect(authorize)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'mailbox_setup_failed'
    if (message === 'mailbox_configuration_missing') {
      const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || url.origin
      return NextResponse.redirect(new URL('/app/settings/mailbox?mailError=configuration', base))
    }
    return NextResponse.json({ error: 'mailbox_setup_failed' }, { status: 500 })
  }
}
