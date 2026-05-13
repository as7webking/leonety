interface RpcLikeClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ error: unknown }>
}

export async function callStopActiveTimer(client: RpcLikeClient, timerId: string) {
  const { error } = await client.rpc('stop_active_timer', { p_timer_id: timerId })
  if (!error) {
    return
  }

  const maybeError = error as { code?: string; message?: string }
  const mayBeLegacySignature =
    maybeError.code === 'PGRST202' ||
    maybeError.message?.toLowerCase().includes('p_user_id') ||
    maybeError.message?.toLowerCase().includes('schema cache')

  if (mayBeLegacySignature) {
    const legacyResult = await client.rpc('stop_active_timer', { p_user_id: timerId })
    if (!legacyResult.error) {
      return
    }

    throw legacyResult.error
  }

  if (error) {
    throw error
  }
}
