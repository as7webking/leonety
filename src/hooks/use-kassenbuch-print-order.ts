'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { KASSENBUCH_PRINT_ORDER_KEY, parseKassenbuchCustomOrder, parseKassenbuchPrintOrder, type KassenbuchCustomOrder, type KassenbuchPrintOrder } from '@/lib/kassenbuch-presentation'

const listeners = new Set<() => void>()
const memoryValues = new Map<string, string>()
const changeEvent = 'leonety:kassenbuch-print-order'
const customOrderEvent = 'leonety:kassenbuch-custom-order'

function emitChange() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const handleStorage = (event: StorageEvent) => {
    if (event.key === KASSENBUCH_PRINT_ORDER_KEY || event.key === null) emitChange()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(changeEvent, emitChange)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(changeEvent, emitChange)
  }
}

function getSnapshot(): KassenbuchPrintOrder {
  try {
    const stored = window.localStorage.getItem(KASSENBUCH_PRINT_ORDER_KEY)
    return parseKassenbuchPrintOrder(stored ?? memoryValues.get(KASSENBUCH_PRINT_ORDER_KEY))
  } catch {
    return parseKassenbuchPrintOrder(memoryValues.get(KASSENBUCH_PRINT_ORDER_KEY))
  }
}

function getServerSnapshot(): KassenbuchPrintOrder {
  return 'chronological'
}

export function useKassenbuchPrintOrderPreference(): [KassenbuchPrintOrder, (value: KassenbuchPrintOrder) => void] {
  const order = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setOrder = useCallback((value: KassenbuchPrintOrder) => {
    memoryValues.set(KASSENBUCH_PRINT_ORDER_KEY, value)
    try {
      window.localStorage.setItem(KASSENBUCH_PRINT_ORDER_KEY, value)
    } catch {
      // Keep the in-memory preference usable when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(changeEvent))
  }, [])
  return [order, setOrder]
}

export function useKassenbuchCustomOrder(companyId: string | undefined): [KassenbuchCustomOrder, (value: KassenbuchCustomOrder) => void] {
  const key = companyId ? `leonety-kassenbuch-custom-order:${companyId}` : ''
  const subscribeCustom = useCallback((listener: () => void) => {
    if (!key) return () => undefined
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener()
    }
    const handleCustomChange = () => listener()
    window.addEventListener('storage', handleStorage)
    window.addEventListener(customOrderEvent, handleCustomChange)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(customOrderEvent, handleCustomChange)
    }
  }, [key])
  const getCustomSnapshot = useCallback(() => {
    if (!key) return ''
    try { return window.localStorage.getItem(key) ?? memoryValues.get(key) ?? '' } catch { return memoryValues.get(key) ?? '' }
  }, [key])
  const serialized = useSyncExternalStore(subscribeCustom, getCustomSnapshot, () => '')
  const customOrder = useMemo(() => parseKassenbuchCustomOrder(serialized), [serialized])
  const setCustomOrder = useCallback((value: KassenbuchCustomOrder) => {
    if (!key) return
    const serializedValue = JSON.stringify(value)
    memoryValues.set(key, serializedValue)
    try {
      window.localStorage.setItem(key, serializedValue)
    } catch {
      // Keep current-session reordering available when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(customOrderEvent))
  }, [key])
  return [customOrder, setCustomOrder]
}
