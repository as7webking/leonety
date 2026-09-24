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

export function OfflineModeProvider({ children }: { children: React.ReactNode }) {
  const { currentCompanyId } = useCompany()
  const [supabase] = useState(() => createClient())
  const [isOnline, setIsOnline] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [draftKinds, setDraftKinds] = useState<OfflineDraftKind[]>([])
  const [connectionRestored, setConnectionRestored] = useState(false)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const previousUserId = useRef<string | null>(null)
  const wasOffline = useRef(false)

  const reportStorageUnavailable = useCallback(() => setStorageUnavailable(true), [])

  const refreshDrafts = useCallback(async () => {
    if (!userId || !currentCompanyId) {
      setDraftKinds([])
      return
    }
    try {
      const drafts = await listOfflineDrafts(userId, currentCompanyId)
      setDraftKinds(drafts.map((draft) => draft.kind))
      setStorageUnavailable(false)
    } catch {
      setDraftKinds([])
      setStorageUnavailable(true)
    }
  }, [currentCompanyId, userId])

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
    void refreshDrafts()
  }, [refreshDrafts])

  useEffect(() => {
    if (!connectionRestored) return
    const timeout = window.setTimeout(() => setConnectionRestored(false), 8000)
    return () => window.clearTimeout(timeout)
  }, [connectionRestored])

  const value = useMemo(() => ({
    isOnline,
    userId,
    draftKinds,
    connectionRestored,
    storageUnavailable,
    refreshDrafts,
    reportStorageUnavailable,
  }), [connectionRestored, draftKinds, isOnline, refreshDrafts, reportStorageUnavailable, storageUnavailable, userId])

  return <OfflineModeContext.Provider value={value}>{children}</OfflineModeContext.Provider>
}

export function useOfflineMode() {
  const value = useContext(OfflineModeContext)
  if (!value) throw new Error('useOfflineMode must be used within OfflineModeProvider')
  return value
}
