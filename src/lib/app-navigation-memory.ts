type MemoryEntry = {
  value: unknown
  updatedAt: number
}

const dataMemory = new Map<string, MemoryEntry>()
const viewMemory = new Map<string, unknown>()

export function getAppDataMemory<T>(key: string) {
  return dataMemory.get(key) as (MemoryEntry & { value: T }) | undefined
}

export function setAppDataMemory<T>(key: string, value: T) {
  dataMemory.set(key, { value, updatedAt: Date.now() })
}

export function getAppViewMemory<T>(key: string) {
  return viewMemory.get(key) as T | undefined
}

export function setAppViewMemory<T>(key: string, value: T) {
  viewMemory.set(key, value)
}

export function clearAppNavigationMemory() {
  dataMemory.clear()
  viewMemory.clear()
}
