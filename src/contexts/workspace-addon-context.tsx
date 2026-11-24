'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import { builtInAddonRegistry } from '@/lib/addons/registry'

type Activation = {
  addonId: string
  enabled: boolean
  available: boolean
  canEnable: boolean
  canOpen: boolean
  canManage: boolean
}

type Snapshot = {
  workspaceId: string | null
  activations: Activation[]
  enabledAddonIds: string[]
  loading: boolean
  error: boolean
  saveError: boolean
}

interface WorkspaceAddonContextValue extends Snapshot {
  refresh: () => Promise<void>
  setEnabled: (addonId: string, enabled: boolean) => Promise<void>
}

const WorkspaceAddonContext = createContext<WorkspaceAddonContextValue | null>(null)

function emptySnapshot(workspaceId: string | null, loading: boolean): Snapshot {
  return { workspaceId, activations: [], enabledAddonIds: [], loading, error: false, saveError: false }
}

export function WorkspaceAddonProvider({ children }: { children: React.ReactNode }) {
  const { currentCompanyId } = useCompany()
  const workspaceIdRef = useRef(currentCompanyId)
  workspaceIdRef.current = currentCompanyId
  const requestVersion = useRef(0)
  const [snapshot, setSnapshot] = useState<Snapshot>(() => emptySnapshot(null, true))
  const [reloadVersion, setReloadVersion] = useState(0)

  const refresh = useCallback(async () => {
    setReloadVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    const version = ++requestVersion.current
    const workspaceId = currentCompanyId
    if (!workspaceId) {
      setSnapshot(emptySnapshot(null, false))
      return
    }

    const controller = new AbortController()
    setSnapshot((current) => current.workspaceId === workspaceId
      ? { ...current, loading: true, error: false, saveError: false }
      : emptySnapshot(workspaceId, true))
    void fetch(`/api/addons?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.workspaceId !== workspaceId || !Array.isArray(result.activations)) {
        throw new Error('addon_status_unavailable')
      }
      if (requestVersion.current !== version || workspaceIdRef.current !== workspaceId) return
      const activations = builtInAddonRegistry.flatMap((addon) => {
        const row = result.activations.find((entry: Activation) => entry.addonId === addon.id)
        return row ? [row as Activation] : []
      })
      const enabledAddonIds = Array.isArray(result.enabledAddonIds)
        ? result.enabledAddonIds.filter((id: unknown): id is string => typeof id === 'string' && builtInAddonRegistry.some((addon) => addon.id === id))
        : []
      setSnapshot({ workspaceId, activations, enabledAddonIds, loading: false, error: false, saveError: false })
    }).catch(() => {
      if (controller.signal.aborted || requestVersion.current !== version || workspaceIdRef.current !== workspaceId) return
      setSnapshot({ ...emptySnapshot(workspaceId, false), error: true })
    })

    return () => controller.abort()
  }, [currentCompanyId, reloadVersion])

  const setEnabled = useCallback(async (addonId: string, enabled: boolean) => {
    const workspaceId = workspaceIdRef.current
    if (!workspaceId) throw new Error('workspace_required')
    try {
      const response = await fetch('/api/addons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, addonId, enabled }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.activation?.addonId !== addonId || result.activation.enabled !== enabled) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'addon_activation_failed')
      }
      if (workspaceIdRef.current !== workspaceId) return
      setSnapshot((current) => {
        if (current.workspaceId !== workspaceId) return current
        const activations = current.activations.map((activation) => activation.addonId === addonId
          ? { ...activation, enabled }
          : activation)
        const enabledAddonIds = activations
          .filter((activation) => activation.enabled && activation.canEnable)
          .map((activation) => activation.addonId)
        return { ...current, activations, enabledAddonIds, saveError: false }
      })
      void refresh()
    } catch (error) {
      if (workspaceIdRef.current === workspaceId) {
        setSnapshot((current) => current.workspaceId === workspaceId ? { ...current, saveError: true } : current)
      }
      throw error
    }
  }, [refresh])

  const currentSnapshot = snapshot.workspaceId === currentCompanyId
    ? snapshot
    : emptySnapshot(currentCompanyId, Boolean(currentCompanyId))
  const value = useMemo(() => ({ ...currentSnapshot, refresh, setEnabled }), [currentSnapshot, refresh, setEnabled])

  return <WorkspaceAddonContext.Provider value={value}>{children}</WorkspaceAddonContext.Provider>
}

export function useWorkspaceAddons() {
  const context = useContext(WorkspaceAddonContext)
  if (!context) throw new Error('useWorkspaceAddons must be used within WorkspaceAddonProvider')
  return context
}
