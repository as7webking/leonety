export function logMailboxFailure(route: string, stage: string, error: unknown) {
  const value = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : null
  const code = typeof value?.code === 'string' && /^[A-Z0-9]{5}$/.test(value.code) ? value.code : undefined
  const messageCode = typeof value?.message === 'string' && /^[a-z_]{1,64}$/.test(value.message) ? value.message : undefined
  console.error('[Leonety Mail] request failed', {
    route,
    stage,
    ...(code ? { databaseCode: code } : {}),
    ...(messageCode ? { category: messageCode } : {}),
  })
}
