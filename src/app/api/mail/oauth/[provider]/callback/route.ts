import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createLimitedMailboxConnection, decryptMailboxSecret, getMailboxEntitlement, requireOwnedMailboxWorkspace, listMailboxConnections, reconcileMailboxDowngrade } from '@/lib/mailbox/server'
import { consumeMailboxOAuthState, exchangeOAuthCode } from '@/lib/mailbox/oauth'
import type { MailboxProviderId } from '@/lib/mailbox/types'
import { freeMailboxIdentityError, mailboxEmailsMatch } from '@/lib/mailbox/free-account'
import { hasRequiredMailboxScopes } from '@/lib/mailbox/scopes'
import { logMailboxFailure } from '@/lib/mailbox/diagnostics'
import { classifyGmailConnectFailure, classifyGmailProviderError } from '@/lib/mailbox/gmail-failure'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params
  if (rawProvider !== 'google' && rawProvider !== 'microsoft') return NextResponse.json({ error: 'unsupported_provider' }, { status: 404 })
  const provider = rawProvider as MailboxProviderId
  const url = new URL(request.url)
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || url.origin
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, base))
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  const fail = (code: string) => redirect(`/app/settings/mailbox?mailError=${encodeURIComponent(code)}`)
  const state = await consumeMailboxOAuthState(provider, url.searchParams.get('state'))
  if (!state) return fail(provider === 'google' ? 'callback_failed' : 'oauth_state')
  if (url.searchParams.has('error')) {
    return fail(provider === 'google'
      ? classifyGmailProviderError(url.searchParams.get('error'))
      : 'oauth_denied')
  }
  if (!url.searchParams.get('code')) return fail(provider === 'google' ? 'callback_failed' : 'oauth_denied')

  const auth = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await auth.auth.getUser()
  if (authError || !user || user.id !== state.userId) return fail(provider === 'google' ? 'callback_failed' : 'session')

  let stage = 'callback'
  try {
    const owned = await requireOwnedMailboxWorkspace(state.companyId, user.id)
    if (!owned) return fail('workspace')
    stage = 'entitlement_resolution'
    const entitlement = await getMailboxEntitlement(state.companyId, user.id, user)
    await reconcileMailboxDowngrade(state.companyId, entitlement.limit)
    const oauthProvider = provider as 'google' | 'microsoft'
    stage = 'token_exchange'
    const tokens = await exchangeOAuthCode(oauthProvider, url.searchParams.get('code')!)
    if (!hasRequiredMailboxScopes(oauthProvider, tokens.scopes)) return fail('missing_scope')
    stage = 'mailbox_identity'
    const identity = await getProviderIdentity(oauthProvider, tokens.accessToken)
    if (state.expectedAccountEmail && !mailboxEmailsMatch(state.expectedAccountEmail, identity.email)) {
      return fail('account_email_mismatch')
    }
    const identityRestriction = freeMailboxIdentityError(entitlement.plan, user, identity.email)
    if (identityRestriction) return fail(identityRestriction)
    stage = 'existing_connection_lookup'
    const existing = (await listMailboxConnections(state.companyId)).find((connection) =>
      connection.provider === provider && connection.provider_account_email.toLowerCase() === identity.email.toLowerCase()
    )
    const refreshToken = tokens.refreshToken || (existing?.refresh_token_encrypted
      ? decryptMailboxSecret(existing.refresh_token_encrypted)
      : '')
    if (!refreshToken) return fail('refresh_missing')
    stage = 'token_storage'
    const savedConnectionId = await createLimitedMailboxConnection({
      companyId: state.companyId,
      limit: entitlement.limit,
      provider,
      email: identity.email,
      displayName: identity.displayName,
      providerAccountId: identity.accountId,
      accessToken: tokens.accessToken,
      refreshToken,
      accessTokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    })
    if (!savedConnectionId) throw new Error('token_storage_failed')
    return redirect('/app/mail?mailConnected=1')
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    logMailboxFailure('oauth.callback', stage, caught)
    const code = message.includes('mailbox_limit_reached') ? 'limit'
      : message === 'free_email_required' || message === 'free_email_mismatch' ? message
        : provider === 'google' ? classifyGmailConnectFailure(stage, message)
          : message === 'provider_rate_limited' ? 'rate_limited'
            : message === 'provider_unavailable' ? 'provider_unavailable'
              : message === 'mailbox_configuration_missing' ? 'configuration'
                : message === 'authorization_expired' ? 'authorization_expired'
                  : message === 'missing_scope' ? 'missing_scope'
                    : message === 'mailbox_identity_missing' ? 'identity_missing'
                      : message === 'reconnect_required' ? 'reconnect'
                        : 'connect_failed'
    return fail(code)
  }
}

async function getProviderIdentity(provider: 'google' | 'microsoft', token: string) {
  const endpoint = provider === 'google'
    ? 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
    : 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName'
  let response: Response
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
  } catch {
    throw new Error('provider_unavailable')
  }
  if (!response.ok) throw new Error(response.status === 401 ? 'authorization_expired'
    : response.status === 403 ? 'missing_scope'
      : response.status === 429 ? 'provider_rate_limited'
        : response.status >= 500 ? 'provider_unavailable' : 'mailbox_identity_failed')
  const data = await response.json() as Record<string, unknown>
  const email = provider === 'google'
    ? data.emailAddress
    : data.mail || data.userPrincipalName
  if (typeof email !== 'string' || !email.includes('@')) throw new Error('mailbox_identity_missing')
  return {
    email: email.trim().toLowerCase(),
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    accountId: typeof data.id === 'string' ? data.id : null,
  }
}
