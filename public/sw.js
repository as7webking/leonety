const CACHE_PREFIX = 'leonety-'
const CACHE_NAME = 'leonety-v6'
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
]
const CACHEABLE_ASSET_PATHS = new Set(ASSETS_TO_CACHE)

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        console.log('Some assets could not be cached during installation')
      })
    }),
    self.skipWaiting(),
  ]))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)

  if (requestUrl.origin !== self.location.origin) {
    return
  }

  const isNextServerRequest =
    requestUrl.pathname.startsWith('/_next/') ||
    requestUrl.searchParams.has('_rsc') ||
    event.request.headers.get('RSC') === '1' ||
    event.request.headers.has('Next-Router-Prefetch')

  const isDynamicApplicationRequest =
    event.request.mode === 'navigate' ||
    requestUrl.pathname.startsWith('/app/') ||
    requestUrl.pathname.startsWith('/auth/') ||
    requestUrl.pathname.startsWith('/api/')

  if (
    isNextServerRequest ||
    isDynamicApplicationRequest ||
    requestUrl.pathname === '/sw.js' ||
    !CACHEABLE_ASSET_PATHS.has(requestUrl.pathname)
  ) {
    return
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => {
      if (response) {
        return response
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response
        }

        const responseToCache = response.clone()

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache)
        })

        return response
      }).catch(() => new Response('PWA asset unavailable while offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }))
    })
  )
})

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload
    try {
      payload = event.data ? event.data.json() : null
    } catch {
      payload = null
    }

    if (!payload || !['incoming-order', 'system-notification'].includes(payload.type)) return

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const foregroundClient = windows.find((client) => client.focused) || windows.find((client) => client.visibilityState === 'visible')
    if (payload.type === 'incoming-order' && foregroundClient) foregroundClient.postMessage(payload)

    const isOrder = payload.type === 'incoming-order'
    const tag = isOrder
      ? `leonety-order-${payload.companyId}-${payload.provider}-${payload.orderId}`
      : 'leonety-system-test'

    await self.registration.showNotification(payload.title || 'Leonety', {
      body: payload.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-96.png',
      tag,
      renotify: isOrder,
      requireInteraction: isOrder,
      silent: isOrder ? Boolean(foregroundClient) : false,
      data: { url: payload.url || '/app/settings/notifications' },
    })
  })().catch((error) => {
    console.warn('Push notification could not be displayed', error)
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = new URL(event.notification.data?.url || '/app/settings/notifications', self.location.origin)
  const safePath = requestedUrl.origin === self.location.origin && requestedUrl.pathname.startsWith('/app/')
    ? `${requestedUrl.pathname}${requestedUrl.search}${requestedUrl.hash}`
    : '/app/dashboard'
  const destination = new URL(safePath, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => client.url.startsWith(self.location.origin))
    if (existing) {
      await existing.navigate(destination)
      return existing.focus()
    }
    return self.clients.openWindow(destination)
  })())
})
