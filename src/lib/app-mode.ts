export const appModes = ['personal', 'business'] as const

export type AppMode = typeof appModes[number]

export function normalizeAppMode(value: unknown): AppMode {
  return value === 'business' ? 'business' : 'personal'
}

export function isAppMode(value: unknown): value is AppMode {
  return typeof value === 'string' && appModes.includes(value as AppMode)
}
