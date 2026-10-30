import type { AppPlan } from '@/lib/billing/plans'

export interface AuthEmailIdentity {
  email?: string | null
  email_confirmed_at?: string | null
}

export function getVerifiedCanonicalAuthEmail(identity: AuthEmailIdentity): string | null {
  const email = identity.email?.trim().toLowerCase()
  const verifiedAt = identity.email_confirmed_at
  if (!email || !verifiedAt || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function mailboxEmailMatchesCanonical(identity: AuthEmailIdentity, mailboxEmail: string): boolean {
  const canonicalEmail = getVerifiedCanonicalAuthEmail(identity)
  return Boolean(canonicalEmail && mailboxEmailsMatch(canonicalEmail, mailboxEmail))
}

export function mailboxEmailsMatch(expectedEmail: string, actualEmail: string): boolean {
  return expectedEmail.trim().toLowerCase() === actualEmail.trim().toLowerCase()
}

export function freeMailboxIdentityError(
  plan: AppPlan,
  identity: AuthEmailIdentity,
  mailboxEmail: string,
): 'free_email_required' | 'free_email_mismatch' | null {
  if (plan !== 'free') return null
  const canonicalEmail = getVerifiedCanonicalAuthEmail(identity)
  if (!canonicalEmail) return 'free_email_required'
  return canonicalEmail === mailboxEmail.trim().toLowerCase() ? null : 'free_email_mismatch'
}
