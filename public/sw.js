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

    if (!payload || payload.type !== 'incoming-order') return

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const foregroundClient = windows.find((client) => client.focused) || windows.find((client) => client.visibilityState === 'visible')
    if (foregroundClient) foregroundClient.postMessage(payload)

    await self.registration.showNotification(payload.title || 'New order', {
      body: payload.body || 'WooCommerce',
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-96.png',
      tag: `leonety-order-${payload.companyId}-${payload.provider}-${payload.orderId}`,
      renotify: true,
      requireInteraction: true,
      silent: Boolean(foregroundClient),
      data: { url: payload.url || '/app/settings/integrations/woocommerce' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url || '/app/settings/integrations/woocommerce', self.location.origin).href
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
