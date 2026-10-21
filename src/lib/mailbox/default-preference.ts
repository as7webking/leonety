export interface MailboxDefaultOption {
  id: string
  status: string
}

export function mailboxDefaultStorageKey(userId: string, companyId: string) {
  return `leonety-mail-default:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`
}

export function readDefaultMailboxId(storage: Pick<Storage, 'getItem'>, key: string) {
  try { return storage.getItem(key) || '' } catch { return '' }
}

export function writeDefaultMailboxId(storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, connectionId: string | null) {
  try {
    if (connectionId) storage.setItem(key, connectionId)
    else storage.removeItem(key)
    return true
  } catch { return false }
}

export function readBrowserDefaultMailboxId(key: string) {
  try { return typeof window === 'undefined' ? '' : readDefaultMailboxId(window.localStorage, key) } catch { return '' }
}

export function writeBrowserDefaultMailboxId(key: string, connectionId: string | null) {
  try { return typeof window !== 'undefined' && writeDefaultMailboxId(window.localStorage, key, connectionId) } catch { return false }
}

export function resolveDefaultMailboxId(preferredId: string, connections: MailboxDefaultOption[]) {
  const connected = connections.filter((connection) => connection.status === 'connected')
  if (connected.some((connection) => connection.id === preferredId)) return preferredId
  return connected[0]?.id ?? ''
}

export function resolveComposeMailboxId(replyConnectionId: string | null, preferredId: string, connections: MailboxDefaultOption[]) {
  if (replyConnectionId) return replyConnectionId
  return resolveDefaultMailboxId(preferredId, connections)
}
