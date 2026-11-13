export interface ProductSyncReference {
  product_id: string
}

export function groupProductSyncs<T extends ProductSyncReference>(syncs: readonly T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {}

  for (const sync of syncs) {
    const productSyncs = grouped[sync.product_id] ?? (grouped[sync.product_id] = [])
    productSyncs.push(sync)
  }

  return grouped
}
