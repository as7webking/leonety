'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import { clearOfflineDataForUser, listOfflineDrafts, type OfflineDraftKind } from '@/lib/offline-drafts'
import { createClient } from '@/lib/supabase-client'

interface OfflineModeContextValue {
  isOnline: boolean
  userId: string | null
  draftKinds: OfflineDraftKind[]
  connectionRestored: boolean
  storageUnavailable: boolean
  refreshDrafts: () => Promise<void>
  reportStorageUnavailable: () => void
}

const OfflineModeContext = createContext<OfflineModeContextValue | undefined>(undefined)

interface DraftKindsState {
  scope: string | null
  kinds: OfflineDraftKind[]
}

async function loadDraftKinds(userId: string, workspaceId: string) {
  const drafts = await listOfflineDrafts(userId, workspaceId)
  return drafts.map((draft) => draft.kind)
}

export function OfflineModeProvider({ children }: { children: React.ReactNode }) {
  const { currentCompanyId } = useCompany()
  const [supabase] = useState(() => createClient())
  const [isOnline, setIsOnline] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [draftKindsState, setDraftKindsState] = useState<DraftKindsState>({ scope: null, kinds: [] })
  const [connectionRestored, setConnectionRestored] = useState(false)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const previousUserId = useRef<string | null>(null)
  const wasOffline = useRef(false)
  const draftScope = userId && currentCompanyId ? `${userId}:${currentCompanyId}` : null

  const reportStorageUnavailable = useCallback(() => setStorageUnavailable(true), [])

  const refreshDrafts = useCallback(async () => {
    if (!userId || !currentCompanyId || !draftScope) return
    try {
      const kinds = await loadDraftKinds(userId, currentCompanyId)
      setDraftKindsState({ scope: draftScope, kinds })
      setStorageUnavailable(false)
    } catch {
      setDraftKindsState({ scope: draftScope, kinds: [] })
      setStorageUnavailable(true)
    }
  }, [currentCompanyId, draftScope, userId])

  useEffect(() => {
    const updateOnlineState = () => {
      const nextOnline = navigator.onLine
      if (!nextOnline) wasOffline.current = true
      if (nextOnline && wasOffline.current) {
        setConnectionRestored(true)
        wasOffline.current = false
      }
      setIsOnline(nextOnline)
    }
    updateOnlineState()
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      const nextUserId = data.user?.id ?? null
      previousUserId.current = nextUserId
      setUserId(nextUserId)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const priorUserId = previousUserId.current
      const nextUserId = session?.user.id ?? null
      if (event === 'SIGNED_OUT' && priorUserId) {
        void clearOfflineDataForUser(priorUserId).catch(() => undefined)
      }
      previousUserId.current = nextUserId
      setUserId(nextUserId)
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!userId || !currentCompanyId || !draftScope) return
    let cancelled = false
    void loadDraftKinds(userId, currentCompanyId)
      .then((kinds) => {
        if (cancelled) return
        setDraftKindsState({ scope: draftScope, kinds })
        setStorageUnavailable(false)
      })
      .catch(() => {
        if (cancelled) return
        setDraftKindsState({ scope: draftScope, kinds: [] })
        setStorageUnavailable(true)
      })
    return () => { cancelled = true }
  }, [currentCompanyId, draftScope, userId])

  useEffect(() => {
    if (!connectionRestored) return
    const timeout = window.setTimeout(() => setConnectionRestored(false), 8000)
    return () => window.clearTimeout(timeout)
  }, [connectionRestored])

  const value = useMemo(() => ({
    isOnline,
    userId,
    draftKinds: draftKindsState.scope === draftScope ? draftKindsState.kinds : [],
    connectionRestored,
    storageUnavailable,
    refreshDrafts,
    reportStorageUnavailable,
  }), [connectionRestored, draftKindsState, draftScope, isOnline, refreshDrafts, reportStorageUnavailable, storageUnavailable, userId])

  return <OfflineModeContext.Provider value={value}>{children}</OfflineModeContext.Provider>
}

export function useOfflineMode() {
  const value = useContext(OfflineModeContext)
  if (!value) throw new Error('useOfflineMode must be used within OfflineModeProvider')
  return value
}
