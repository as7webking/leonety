export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  return process.env.NODE_ENV === 'production' ? 'https://leonety.vercel.app' : 'http://localhost:3000'
}

const legacyAppRoutes: Record<string, string> = {
  '/dashboard': '/app/dashboard',
  '/income': '/app/income',
  '/expenses': '/app/expenses',
  '/transactions': '/app/transactions',
  '/time': '/app/time',
  '/onboarding': '/app/onboarding',
  '/profile': '/app/profile',
  '/workspaces': '/app/workspaces',
  '/upgrade': '/app/upgrade',
  '/clients': '/app/clients',
  '/invoices': '/app/invoices',
  '/products': '/app/products',
  '/inventory': '/app/inventory',
  '/settings': '/app/profile',
}

export function getSafeAppRedirectPath(next: string | null | undefined, fallback = '/app/dashboard') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback
  }

  let parsed: URL
  try {
    parsed = new URL(next, 'https://leonety.invalid')
  } catch {
    return fallback
  }

  if (parsed.origin !== 'https://leonety.invalid') return fallback

  const normalizedPath = legacyAppRoutes[parsed.pathname] ?? parsed.pathname

  const isAppPath = normalizedPath === '/app' || normalizedPath.startsWith('/app/')
  if (!isAppPath && normalizedPath !== '/login' && normalizedPath !== '/reset-password') {
    return fallback
  }

  return `${normalizedPath}${parsed.search}${parsed.hash}`
}

export function getAuthCallbackUrl(next = '/app/profile') {
  const url = new URL('/auth/callback', getSiteUrl())
  url.searchParams.set('next', getSafeAppRedirectPath(next, '/app/profile'))
  return url.toString()
}
