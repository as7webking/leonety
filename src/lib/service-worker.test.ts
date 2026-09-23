import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const serviceWorkerSource = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

function createServiceWorkerHarness() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const notifications: Array<{ title: string; options: Record<string, unknown> }> = []
  const openedUrls: string[] = []
  const cache = {
    addAll: async () => undefined,
    put: async () => undefined,
  }
  const caches = {
    open: async () => cache,
    keys: async () => ['leonety-v5', 'unrelated-cache'],
    delete: async () => true,
    match: async () => undefined,
  }
  const self = {
    location: { origin: 'https://leonety.vercel.app' },
    addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) => listeners.set(name, listener),
    skipWaiting: async () => undefined,
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async (url: string) => { openedUrls.push(url) },
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        notifications.push({ title, options })
      },
    },
  }

  vm.runInNewContext(serviceWorkerSource, {
    self,
    caches,
    fetch: async () => new Response('ok'),
    Headers,
    Promise,
    Response,
    Set,
    URL,
    console,
  })

  return { listeners, notifications, openedUrls }
}

function isFetchIntercepted(path: string, options: { mode?: string; headers?: Headers } = {}) {
  const { listeners } = createServiceWorkerHarness()
  let response: Promise<Response> | undefined
  listeners.get('fetch')?.({
    request: {
      method: 'GET',
      mode: options.mode ?? 'cors',
      url: `https://leonety.vercel.app${path}`,
      headers: options.headers ?? new Headers(),
    },
    respondWith: (value: Promise<Response>) => {
      response = value
    },
  })
  return response
}

test('does not intercept documents, authenticated routes, APIs or Next.js RSC requests', () => {
  assert.equal(isFetchIntercepted('/', { mode: 'navigate' }), undefined)
  assert.equal(isFetchIntercepted('/app/profile'), undefined)
  assert.equal(isFetchIntercepted('/api/account/access'), undefined)
  assert.equal(isFetchIntercepted('/_next/static/chunk.js'), undefined)
  assert.equal(isFetchIntercepted('/profile?_rsc=abc'), undefined)
  assert.equal(isFetchIntercepted('/profile', { headers: new Headers({ RSC: '1' }) }), undefined)
})

test('intercepts only explicitly precached public PWA assets', () => {
  assert.ok(isFetchIntercepted('/manifest.json'))
  assert.ok(isFetchIntercepted('/brand/icon-192.png'))
  assert.equal(isFetchIntercepted('/brand/landing-image.webp'), undefined)
})

test('shows generic system notifications as non-silent without changing fetch handling', async () => {
  const { listeners, notifications } = createServiceWorkerHarness()
  let pending: Promise<unknown> | undefined

  listeners.get('push')?.({
    data: { json: () => ({ type: 'system-notification', title: 'Test', body: 'Ready', url: '/app/settings/notifications' }) },
    waitUntil: (value: Promise<unknown>) => { pending = value },
  })
  await pending

  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].title, 'Test')
  assert.equal(notifications[0].options.silent, false)
  assert.equal((notifications[0].options.data as { url?: string }).url, '/app/settings/notifications')
})

test('ignores unknown push payloads and sanitizes notification click destinations', async () => {
  const { listeners, notifications, openedUrls } = createServiceWorkerHarness()
  let pushPending: Promise<unknown> | undefined
  listeners.get('push')?.({
    data: { json: () => ({ type: 'unknown', title: 'No' }) },
    waitUntil: (value: Promise<unknown>) => { pushPending = value },
  })
  await pushPending
  assert.equal(notifications.length, 0)

  let clickPending: Promise<unknown> | undefined
  listeners.get('notificationclick')?.({
    notification: { close: () => undefined, data: { url: 'https://evil.example/phishing' } },
    waitUntil: (value: Promise<unknown>) => { clickPending = value },
  })
  await clickPending
  assert.deepEqual(openedUrls, ['https://leonety.vercel.app/app/dashboard'])
})
