export interface WooIdentityProduct {
  id: number
  meta_data?: Array<{ key?: string; value?: unknown }>
}

export function isLeonetyWooProduct(product: WooIdentityProduct, leonetyProductId: string) {
  return product.meta_data?.some(
    (field) => field.key === 'leonety_product_id' && String(field.value) === leonetyProductId
  ) ?? false
}

export function findLeonetyWooProduct<T extends WooIdentityProduct>(
  products: T[],
  leonetyProductId: string
): { product: T | null; ambiguous: boolean } {
  const matches = products.filter((product) => isLeonetyWooProduct(product, leonetyProductId))
  return { product: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 }
}

export async function persistPublishedWooMapping<T extends WooIdentityProduct>(
  product: T,
  persist: (product: T) => Promise<void>
): Promise<{ status: 'mapped' } | { status: 'mapping_failed'; reconciliationWooProductId: number }> {
  try {
    await persist(product)
    return { status: 'mapped' }
  } catch {
    return { status: 'mapping_failed', reconciliationWooProductId: product.id }
  }
}

export function getWooImageWarning(imageUrl: string | null | undefined) {
  if (!imageUrl) return null

  let url: URL
  try {
    url = new URL(imageUrl)
  } catch {
    return 'Product synced without image because the image URL is invalid.'
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Product synced without image because the image URL is not HTTP or HTTPS.'
  }

  if (!/\.jpe?g$/i.test(url.pathname)) {
    return 'Product synced without image because WooCommerce publishing requires JPG/JPEG. Upload the image through Leonety to normalize it.'
  }

  return null
}

const pendingIdPrefix = 'leonety:woocommerce:reconcile:'

export function savePendingWooReconciliation(companyId: string, productId: string, wooProductId: number) {
  if (typeof window === 'undefined' || !Number.isSafeInteger(wooProductId) || wooProductId <= 0) return
  try {
    window.sessionStorage.setItem(`${pendingIdPrefix}${companyId}:${productId}`, String(wooProductId))
  } catch {
    // Session storage is optional; the API also reconciles products by SKU when available.
  }
}

export function getPendingWooReconciliation(companyId: string, productId: string) {
  if (typeof window === 'undefined') return null
  try {
    const value = Number(window.sessionStorage.getItem(`${pendingIdPrefix}${companyId}:${productId}`))
    return Number.isSafeInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function clearPendingWooReconciliation(companyId: string, productId: string) {
  try {
    if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(`${pendingIdPrefix}${companyId}:${productId}`)
    }
  } catch {
    // Session storage is optional.
  }
}
