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

export function getAuthCallbackUrl(next = '/profile') {
  const url = new URL('/auth/callback', getSiteUrl())
  url.searchParams.set('next', next)
  return url.toString()
}
