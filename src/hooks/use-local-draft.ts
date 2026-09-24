'use client'

import { useCallback, useEffect, useState } from 'react'
import { useOfflineMode } from '@/contexts/offline-mode-context'
import { deleteOfflineDraft, getOfflineDraft, saveOfflineDraft, type OfflineDraft, type OfflineDraftKind } from '@/lib/offline-drafts'

export function useLocalDraft<T extends object>(kind: OfflineDraftKind, workspaceId: string | null | undefined) {
  const { userId, refreshDrafts, reportStorageUnavailable } = useOfflineMode()
  const [draft, setDraft] = useState<OfflineDraft<T> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!userId || !workspaceId) {
      setDraft(null)
      setLoading(false)
      return
    }
    setDraft(null)
    setLoading(true)
    void getOfflineDraft<T>(userId, workspaceId, kind)
      .then((result) => {
        if (!cancelled) setDraft(result)
      })
      .catch(() => {
        if (!cancelled) reportStorageUnavailable()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [kind, reportStorageUnavailable, userId, workspaceId])

  const save = useCallback(async (payload: T) => {
    if (!userId || !workspaceId) throw new Error('offline_storage_unavailable')
    try {
      const saved = await saveOfflineDraft(userId, workspaceId, kind, payload) as OfflineDraft<T>
      setDraft(saved)
      await refreshDrafts()
      return saved
    } catch (error) {
      reportStorageUnavailable()
      throw error
    }
  }, [kind, refreshDrafts, reportStorageUnavailable, userId, workspaceId])

  const discard = useCallback(async () => {
    if (!userId || !workspaceId) return
    try {
      await deleteOfflineDraft(userId, workspaceId, kind)
      setDraft(null)
      await refreshDrafts()
    } catch (error) {
      reportStorageUnavailable()
      throw error
    }
  }, [kind, refreshDrafts, reportStorageUnavailable, userId, workspaceId])

  return { draft, loading, save, discard }
}
