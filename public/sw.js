const CACHE_NAME = 'leonety-v5'
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        console.log('Some assets could not be cached during installation')
      })
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)

  if (requestUrl.origin !== self.location.origin) {
    return
  }

  if (
    requestUrl.pathname.startsWith('/_next/') ||
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname === '/sw.js'
  ) {
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request))
    return
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
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
      })
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
