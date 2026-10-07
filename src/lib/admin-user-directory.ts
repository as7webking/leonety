export const ADMIN_USERS_PAGE_SIZE = 25
export const ADMIN_USERS_MAX_PAGE_SIZE = 100

export type AdminUserStatus = 'active' | 'unconfirmed' | 'deactivated'

export function normalizeAdminUsersPage(value: string | null) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function normalizeAdminUsersPageSize(value: string | null) {
  const pageSize = Number(value)
  if (!Number.isInteger(pageSize) || pageSize < 1) return ADMIN_USERS_PAGE_SIZE
  return Math.min(pageSize, ADMIN_USERS_MAX_PAGE_SIZE)
}

export function normalizeAdminUsersSearch(value: string | null) {
  return value?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? ''
}

export function escapePostgresLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export function getAdminUserStatus({
  emailConfirmed,
  bannedUntil,
  now = new Date(),
}: {
  emailConfirmed: boolean
  bannedUntil: string | null | undefined
  now?: Date
}): AdminUserStatus {
  if (bannedUntil && new Date(bannedUntil) > now) return 'deactivated'
  if (!emailConfirmed) return 'unconfirmed'
  return 'active'
}

export function getSafeAuthProvider(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== 'object') return 'email'
  const provider = (appMetadata as { provider?: unknown }).provider
  return typeof provider === 'string' && provider.trim() ? provider.trim() : 'email'
}
