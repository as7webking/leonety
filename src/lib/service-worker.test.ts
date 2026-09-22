import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const serviceWorkerSource = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

function createServiceWorkerHarness() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
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
      openWindow: async () => undefined,
    },
    registration: { showNotification: async () => undefined },
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

  return { listeners }
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
