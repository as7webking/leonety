const allowedReturnPaths = ['/app/products', '/app/inventory'] as const
const scrollKeyPrefix = 'leonety:product-return-scroll:'

export function getSafeProductReturnPath(value: string | null | undefined, fallback = '/app/products') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback

  try {
    const url = new URL(value, 'https://leonety.local')
    if (url.origin !== 'https://leonety.local' || !allowedReturnPaths.includes(url.pathname as typeof allowedReturnPaths[number])) {
      return fallback
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export function buildProductEditorHref(productId: string, returnPath: string) {
  return `/app/products/${encodeURIComponent(productId)}/edit?returnTo=${encodeURIComponent(getSafeProductReturnPath(returnPath))}`
}

export function rememberProductReturnScroll(returnPath: string, scrollY: number) {
  if (typeof window === 'undefined') return
  const safePath = getSafeProductReturnPath(returnPath)
  window.sessionStorage.setItem(`${scrollKeyPrefix}${safePath}`, String(Math.max(0, Math.round(scrollY))))
}

export function restoreProductReturnScroll(returnPath: string) {
  if (typeof window === 'undefined') return false
  const safePath = getSafeProductReturnPath(returnPath)
  const key = `${scrollKeyPrefix}${safePath}`
  const stored = window.sessionStorage.getItem(key)
  if (stored === null) return false
  window.sessionStorage.removeItem(key)
  const scrollY = Number(stored)
  if (!Number.isFinite(scrollY)) return false
  window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'auto' }))
  return true
}
