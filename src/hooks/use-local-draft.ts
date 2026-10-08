'use client'

import { useCallback, useEffect, useState } from 'react'
import { useOfflineMode } from '@/contexts/offline-mode-context'
import { buildOfflineDraftKey, deleteOfflineDraft, getOfflineDraft, saveOfflineDraft, type OfflineDraft, type OfflineDraftKind } from '@/lib/offline-drafts'

interface LoadedDraft<T extends object> {
  key: string | null
  draft: OfflineDraft<T> | null
}

export function useLocalDraft<T extends object>(kind: OfflineDraftKind, workspaceId: string | null | undefined) {
  const { userId, refreshDrafts, reportStorageUnavailable } = useOfflineMode()
  const draftKey = userId && workspaceId ? buildOfflineDraftKey(userId, workspaceId, kind) : null
  const [loadedDraft, setLoadedDraft] = useState<LoadedDraft<T>>({ key: null, draft: null })
  const draft = loadedDraft.key === draftKey ? loadedDraft.draft : null
  const loading = draftKey !== null && loadedDraft.key !== draftKey

  useEffect(() => {
    let cancelled = false
    if (!userId || !workspaceId || !draftKey) return
    void getOfflineDraft<T>(userId, workspaceId, kind)
      .then((result) => {
        if (!cancelled) setLoadedDraft({ key: draftKey, draft: result })
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedDraft({ key: draftKey, draft: null })
          reportStorageUnavailable()
        }
      })
    return () => { cancelled = true }
  }, [draftKey, kind, reportStorageUnavailable, userId, workspaceId])

  const save = useCallback(async (payload: T) => {
    if (!userId || !workspaceId) throw new Error('offline_storage_unavailable')
    try {
      const saved = await saveOfflineDraft(userId, workspaceId, kind, payload) as OfflineDraft<T>
      setLoadedDraft({ key: saved.key, draft: saved })
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
      setLoadedDraft({ key: buildOfflineDraftKey(userId, workspaceId, kind), draft: null })
      await refreshDrafts()
    } catch (error) {
      reportStorageUnavailable()
      throw error
    }
  }, [kind, refreshDrafts, reportStorageUnavailable, userId, workspaceId])

  return { draft, loading, save, discard }
}
