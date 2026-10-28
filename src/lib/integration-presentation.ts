export interface ChannelSyncRecord {
  external_product_id: string | null
  sync_status: 'not_synced' | 'pending' | 'synced' | 'failed'
  last_synced_at?: string | null
}

export function getChannelPublicationCounts(totalProducts: number, records: ChannelSyncRecord[]) {
  const published = records.filter((row) => row.sync_status === 'synced' && Boolean(row.external_product_id)).length
  const errors = records.filter((row) => row.sync_status === 'failed').length
  const pending = records.filter((row) => row.sync_status === 'pending').length

  return {
    published,
    errors,
    pending,
    notPublished: Math.max(0, totalProducts - published - errors - pending),
    lastSuccessfulSync: records
      .filter((row) => row.sync_status === 'synced' && row.external_product_id && row.last_synced_at)
      .map((row) => row.last_synced_at as string)
      .sort((left, right) => right.localeCompare(left))[0] ?? null,
  }
}

export function getProductChannelPresentation(sync: ChannelSyncRecord | null | undefined) {
  if (!sync) return 'not_published' as const
  if (sync.sync_status === 'failed') return 'error' as const
  if (sync.sync_status === 'pending') return sync.external_product_id ? 'update_pending' as const : 'pending' as const
  if (sync.sync_status !== 'synced' || !sync.external_product_id) return 'not_published' as const
  return 'published' as const
}

export function getProductChannelTranslationKey(sync: ChannelSyncRecord | null | undefined) {
  const status = getProductChannelPresentation(sync)
  if (status === 'error') return 'syncError' as const
  if (status === 'not_published') return 'notPublished' as const
  return status
}
