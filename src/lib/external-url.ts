export function safeExternalHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}
