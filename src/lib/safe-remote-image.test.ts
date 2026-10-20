import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { fetchSafeRemoteImage, isPublicRemoteImageAddress, RemoteImageFetchError } from './safe-remote-image.ts'

const importRoute = readFileSync(resolve('src/app/api/product-images/import/route.ts'), 'utf8')

test('remote image address policy permits public IPs and rejects local, private, link-local and metadata IPs', () => {
  assert.equal(isPublicRemoteImageAddress('93.184.216.34'), true)
  for (const address of [
    '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1',
    '169.254.1.1', '169.254.169.254', '100.100.100.200', '168.63.129.16',
    '::1', 'fe80::1', 'fc00::1',
  ]) assert.equal(isPublicRemoteImageAddress(address), false, address)
})

test('valid public image fetch is DNS-pinned and returns the image bytes', async () => {
  const result = await fetchSafeRemoteImage('https://images.example.com/picture.jpg', 100, {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async (_url, hostname, address) => {
      assert.equal(hostname, 'images.example.com')
      assert.equal(address.address, '93.184.216.34')
      return { status: 200, location: null, body: Buffer.from('jpeg-bytes') }
    },
  })
  assert.equal(result.toString(), 'jpeg-bytes')
})

test('localhost and numeric loopback/private/link-local destinations are rejected before request', async () => {
  for (const input of [
    'http://localhost/image.jpg', 'http://127.0.0.1/image.jpg',
    'http://192.168.1.2/image.jpg', 'http://169.254.169.254/image.jpg',
  ]) {
    let requested = false
    await assert.rejects(fetchSafeRemoteImage(input, 100, {
      lookup: async (hostname) => [{ address: hostname, family: 4 }],
      request: async () => {
        requested = true
        return { status: 200, location: null, body: Buffer.from('no') }
      },
    }), RemoteImageFetchError)
    assert.equal(requested, false)
  }
})

test('redirect to a private destination is revalidated and blocked', async () => {
  let requestCount = 0
  await assert.rejects(fetchSafeRemoteImage('https://images.example.com/start.jpg', 100, {
    lookup: async (hostname) => [{ address: hostname === 'images.example.com' ? '93.184.216.34' : '10.0.0.2', family: 4 }],
    request: async () => {
      requestCount += 1
      return { status: 302, location: 'http://internal.example/private.jpg', body: Buffer.alloc(0) }
    },
  }), RemoteImageFetchError)
  assert.equal(requestCount, 1)
})

test('redirect count, timeout, and nonstandard ports fail closed', async () => {
  await assert.rejects(fetchSafeRemoteImage('https://images.example.com:8080/a.jpg', 100), RemoteImageFetchError)
  await assert.rejects(fetchSafeRemoteImage('https://images.example.com/a.jpg', 100, {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => { throw new RemoteImageFetchError('timeout') },
  }), RemoteImageFetchError)
  await assert.rejects(fetchSafeRemoteImage('https://images.example.com/a.jpg', 3, {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => ({ status: 200, location: null, body: Buffer.from('oversized') }),
  }), (error: unknown) => error instanceof RemoteImageFetchError && error.code === 'too_large')
})

test('image import route uses the SSRF-safe fetcher and does not follow redirects automatically', () => {
  assert.match(importRoute, /fetchSafeRemoteImage\(imageUrl, BUSINESS_IMAGE_MAX_INPUT_BYTES\)/)
  assert.doesNotMatch(importRoute, /fetch\(url,\s*\{[\s\S]*redirect:\s*'follow'/)
})
