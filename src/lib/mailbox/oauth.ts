import 'server-only'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { decryptSecret, encryptSecret } from '@/lib/credential-encryption'
import type { MailboxProviderId } from './types'
import { MAILBOX_REQUIRED_SCOPES } from './scopes'
import { classifyOAuthFailure } from './oauth-errors'
import { isValidMailboxOAuthState, type MailboxOAuthState } from './oauth-state'

const STATE_COOKIE = 'leonety-mail-oauth-state'
const GOOGLE_SCOPES = [...MAILBOX_REQUIRED_SCOPES.google]
const MICROSOFT_SCOPES = ['openid', 'profile', 'email', 'offline_access', ...MAILBOX_REQUIRED_SCOPES.microsoft]

export function mailboxCallbackUrl(provider: MailboxProviderId) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')
  if (!siteUrl) throw new Error('mailbox_configuration_missing')
  const url = new URL(siteUrl)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('mailbox_configuration_missing')
  return `${url.origin}/api/mail/oauth/${provider}/callback`
}

export async function createMailboxOAuthState(input: Omit<MailboxOAuthState, 'state' | 'expiresAt'>) {
  const state = crypto.randomBytes(32).toString('base64url')
  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, encryptSecret(JSON.stringify({
    ...input,
    state,
    expiresAt: Date.now() + 10 * 60 * 1000,
  } satisfies MailboxOAuthState)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })
  return state
}

export async function consumeMailboxOAuthState(provider: MailboxProviderId, receivedState: string | null) {
  const cookieStore = await cookies()
  const encoded = cookieStore.get(STATE_COOKIE)?.value
  cookieStore.delete(STATE_COOKIE)
  if (!encoded || !receivedState) return null
  try {
    const state = JSON.parse(decryptSecret(encoded)) as MailboxOAuthState
    if (!isValidMailboxOAuthState(state, receivedState, provider)) return null
    return state
  } catch {
    return null
  }
}

export function getOAuthScopes(provider: 'google' | 'microsoft') {
  return provider === 'google' ? GOOGLE_SCOPES : MICROSOFT_SCOPES
}

export function mailboxOAuthConfig(provider: 'google' | 'microsoft') {
  const clientId = provider === 'google'
    ? process.env.GOOGLE_MAILBOX_CLIENT_ID?.trim()
    : process.env.MICROSOFT_MAILBOX_CLIENT_ID?.trim()
  const clientSecret = provider === 'google'
    ? process.env.GOOGLE_MAILBOX_CLIENT_SECRET?.trim()
    : process.env.MICROSOFT_MAILBOX_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('mailbox_configuration_missing')
  return { clientId, clientSecret }
}

export interface OAuthTokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: string
  scopes: string[]
}

export async function exchangeOAuthCode(provider: 'google' | 'microsoft', code: string): Promise<OAuthTokenSet> {
  const { clientId, clientSecret } = mailboxOAuthConfig(provider)
  const redirectUri = mailboxCallbackUrl(provider)
  const endpoint = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
  } catch {
    throw new Error('provider_unavailable')
  }
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || typeof body?.access_token !== 'string') {
    const providerError = typeof body?.error === 'string' ? body.error : null
    if (provider === 'google' && ['invalid_client', 'unauthorized_client', 'redirect_uri_mismatch'].includes(providerError ?? '')) {
      throw new Error('oauth_configuration')
    }
    const code = classifyOAuthFailure(response.status, providerError)
    throw new Error(code === 'rate_limited' ? 'provider_rate_limited' : code)
  }
  const scopeValue = typeof body.scope === 'string' ? body.scope : ''
  const refresh = typeof body.refresh_token === 'string' ? body.refresh_token : ''
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600
  return {
    accessToken: body.access_token,
    refreshToken: refresh,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scopes: scopeValue.split(/\s+/).filter(Boolean),
  }
}

export async function refreshOAuthToken(
  provider: 'google' | 'microsoft',
  refreshToken: string,
): Promise<OAuthTokenSet> {
  const { clientId, clientSecret } = mailboxOAuthConfig(provider)
  const endpoint = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    ...(provider === 'microsoft' ? { scope: MICROSOFT_SCOPES.join(' ') } : {}),
  })
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || typeof body?.access_token !== 'string') {
    if (response.status === 429) throw new Error('provider_rate_limited')
    if (response.status >= 500) throw new Error('provider_unavailable')
    throw new Error('reconnect_required')
  }
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scopes: typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : getOAuthScopes(provider),
  }
}
