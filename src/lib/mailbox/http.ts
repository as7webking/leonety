import { MailboxProviderError } from './types'

export async function readMailboxJson<T>(response: Response, maxBytes = 2_500_000): Promise<T> {
  if (!response.body) throw new MailboxProviderError('provider_error')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new MailboxProviderError('provider_error')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
    return JSON.parse(body) as T
  } catch (error) {
    if (error instanceof MailboxProviderError) throw error
    throw new MailboxProviderError('provider_error')
  }
}
