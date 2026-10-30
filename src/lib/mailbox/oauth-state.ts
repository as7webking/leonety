import type { MailboxProviderId } from './types'

export interface MailboxOAuthState {
  state: string
  userId: string
  companyId: string
  provider: MailboxProviderId
  expectedAccountEmail?: string
  expiresAt: number
}

export function isValidMailboxOAuthState(
  value: MailboxOAuthState,
  receivedState: string | null,
  provider: MailboxProviderId,
  now = Date.now(),
) {
  return Boolean(
    receivedState && value.state === receivedState && value.provider === provider &&
    value.userId && value.companyId && Number.isFinite(value.expiresAt) && value.expiresAt >= now,
  )
}
