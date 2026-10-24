import 'server-only'

import { encryptSecret } from '@/lib/credential-encryption'
import { decryptMailboxSecret, updateMailboxConnection } from './server'
import { refreshOAuthToken } from './oauth'
import { GoogleMailboxProvider } from './google-provider'
import { MicrosoftMailboxProvider } from './microsoft-provider'
import { ImapSmtpMailboxProvider } from './imap-provider'
import { MailboxProviderError, type MailboxConnectionRecord, type MailboxProvider } from './types'

export async function createMailboxProvider(connection: MailboxConnectionRecord): Promise<MailboxProvider> {
  if (connection.status !== 'connected') {
    throw new MailboxProviderError(connection.status === 'plan_restricted' ? 'reconnect_required' : 'reconnect_required')
  }
  if (connection.provider === 'imap') return new ImapSmtpMailboxProvider(connection)

  if (connection.provider !== 'google' && connection.provider !== 'microsoft') {
    throw new MailboxProviderError('provider_error')
  }
  const refreshToken = decryptMailboxSecret(connection.refresh_token_encrypted)
  let accessToken = decryptMailboxSecret(connection.access_token_encrypted)
  const expiresAt = connection.access_token_expires_at ? Date.parse(connection.access_token_expires_at) : 0
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000) {
    let refreshed
    try {
      refreshed = await refreshOAuthToken(connection.provider, refreshToken)
    } catch (error) {
      if (connection.provider === 'google') {
        if (error instanceof Error && error.message === 'reconnect_required') {
          const saved = await updateMailboxConnection(connection.company_id, connection.id, {
            status: 'reconnect_required', last_error_code: 'authorization_revoked',
          }).catch(() => null)
          if (!saved) throw new MailboxProviderError('token_storage_failed')
          throw new MailboxProviderError('reconnect_required')
        }
        if (error instanceof Error && error.message === 'mailbox_configuration_missing') {
          throw new MailboxProviderError('oauth_configuration')
        }
        throw new MailboxProviderError('token_refresh_failed')
      }
      if (error instanceof Error && error.message === 'reconnect_required') {
        await updateMailboxConnection(connection.company_id, connection.id, {
          status: 'reconnect_required', last_error_code: 'authorization_revoked',
        })
      }
      if (error instanceof Error && error.message === 'provider_rate_limited') {
        throw new MailboxProviderError('rate_limited')
      }
      if (error instanceof Error && error.message === 'provider_unavailable') {
        throw new MailboxProviderError('provider_unavailable')
      }
      if (error instanceof MailboxProviderError) throw error
      throw error
    }
    if (connection.provider === 'google') {
      try {
        accessToken = refreshed.accessToken
        const saved = await updateMailboxConnection(connection.company_id, connection.id, {
          access_token_encrypted: encryptSecret(refreshed.accessToken),
          refresh_token_encrypted: encryptSecret(refreshed.refreshToken),
          access_token_expires_at: refreshed.expiresAt,
          granted_scopes: refreshed.scopes,
          status: 'connected',
          last_error_code: null,
        })
        if (!saved) throw new Error('token_storage_failed')
      } catch {
        throw new MailboxProviderError('token_storage_failed')
      }
    } else {
      accessToken = refreshed.accessToken
      await updateMailboxConnection(connection.company_id, connection.id, {
        access_token_encrypted: encryptSecret(refreshed.accessToken),
        refresh_token_encrypted: encryptSecret(refreshed.refreshToken),
        access_token_expires_at: refreshed.expiresAt,
        granted_scopes: refreshed.scopes,
        status: 'connected',
        last_error_code: null,
      })
    }
  }
  return connection.provider === 'google'
    ? new GoogleMailboxProvider(accessToken, connection.provider_account_email, connection.id)
    : new MicrosoftMailboxProvider(accessToken, connection.provider_account_email, connection.id)
}

export async function recordMailboxUse(connection: MailboxConnectionRecord) {
  const lastUsed = connection.last_successful_connection_at ? Date.parse(connection.last_successful_connection_at) : 0
  if (Date.now() - lastUsed < 5 * 60 * 1000) return
  await updateMailboxConnection(connection.company_id, connection.id, {
    last_successful_connection_at: new Date().toISOString(),
    last_error_code: null,
  })
}
