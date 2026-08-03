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

  const normalized = legacyAppRoutes[next] ?? next

  if (!normalized.startsWith('/app') && normalized !== '/login' && normalized !== '/reset-password') {
    return fallback
  }

  return normalized
}

export function getAuthCallbackUrl(next = '/app/profile') {
  const url = new URL('/auth/callback', getSiteUrl())
  url.searchParams.set('next', getSafeAppRedirectPath(next, '/app/profile'))
  return url.toString()
}
