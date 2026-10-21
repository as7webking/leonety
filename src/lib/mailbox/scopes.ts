export const MAILBOX_REQUIRED_SCOPES = {
  google: ['https://www.googleapis.com/auth/gmail.modify'],
  microsoft: ['User.Read', 'Mail.ReadWrite', 'Mail.Send'],
} as const

function normalizeScope(scope: string) {
  return scope.trim().toLowerCase().split('/').at(-1) ?? ''
}

export function hasRequiredMailboxScopes(provider: keyof typeof MAILBOX_REQUIRED_SCOPES, grantedScopes: string[]) {
  const granted = new Set(grantedScopes.map(normalizeScope))
  return MAILBOX_REQUIRED_SCOPES[provider].every((scope) => granted.has(normalizeScope(scope)))
}
