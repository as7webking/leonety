export type ProductWorkspaceTab = 'general' | 'images' | 'pricing' | 'inventory' | 'history' | 'channels'

export function isProductLowStock(quantity: number, threshold: number) {
  return Number.isFinite(quantity) && Number.isFinite(threshold) && quantity <= threshold
}

