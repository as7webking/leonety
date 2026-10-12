import 'server-only'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { decryptSecret, encryptSecret } from '@/lib/credential-encryption'
import type { MailboxProviderId } from './types'

const STATE_COOKIE = 'leonety-mail-oauth-state'
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
const MICROSOFT_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send']

interface OAuthState {
  state: string
  userId: string
  companyId: string
  provider: MailboxProviderId
  expiresAt: number
}

export function mailboxCallbackUrl(provider: MailboxProviderId) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')
  if (!siteUrl) throw new Error('mailbox_configuration_missing')
  const url = new URL(siteUrl)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('mailbox_configuration_missing')
  return `${url.origin}/api/mail/oauth/${provider}/callback`
}

export async function createMailboxOAuthState(input: Omit<OAuthState, 'state' | 'expiresAt'>) {
  const state = crypto.randomBytes(32).toString('base64url')
  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, encryptSecret(JSON.stringify({
    ...input,
    state,
    expiresAt: Date.now() + 10 * 60 * 1000,
  } satisfies OAuthState)), {
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
    const state = JSON.parse(decryptSecret(encoded)) as OAuthState
    if (state.state !== receivedState || state.provider !== provider || state.expiresAt < Date.now()) return null
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
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || typeof body?.access_token !== 'string') {
    throw new Error(response.status === 429 ? 'provider_rate_limited' : response.status >= 500 ? 'provider_unavailable' : 'mailbox_oauth_failed')
  }
  const scopeValue = typeof body.scope === 'string' ? body.scope : getOAuthScopes(provider).join(' ')
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
