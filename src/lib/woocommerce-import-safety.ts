export type WooImportDecision = 'create' | 'skip_linked' | 'skip_conflict'

export function getWooImportDecision(input: { hasMapping: boolean; hasSkuMatch: boolean }): WooImportDecision {
  if (input.hasMapping) return 'skip_linked'
  if (input.hasSkuMatch) return 'skip_conflict'
  return 'create'
}
