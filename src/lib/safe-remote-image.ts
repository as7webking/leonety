import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, BlockList } from 'node:net'
import { checkServerIdentity } from 'node:tls'

const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 10_000
const blockedAddresses = new BlockList()

for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['168.63.129.16', 32], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedAddresses.addSubnet(network, prefix, 'ipv4')

for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blockedAddresses.addSubnet(network, prefix, 'ipv6')

export class RemoteImageFetchError extends Error {
  readonly code: 'unsafe_destination' | 'timeout' | 'too_large' | 'fetch_failed'

  constructor(code: 'unsafe_destination' | 'timeout' | 'too_large' | 'fetch_failed') {
    super(code)
    this.code = code
  }
}

export function isPublicRemoteImageAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return !blockedAddresses.check(address, 'ipv4')
  if (family !== 6) return false
  if (address.toLowerCase().startsWith('::ffff:')) return false

  const inGlobalUnicast = new BlockList()
  inGlobalUnicast.addSubnet('2000::', 3, 'ipv6')
  return inGlobalUnicast.check(address, 'ipv6') && !blockedAddresses.check(address, 'ipv6')
}

function validateRemoteImageUrl(url: URL) {
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new RemoteImageFetchError('unsafe_destination')
  }
  const expectedPort = url.protocol === 'https:' ? '443' : '80'
  if (url.port && url.port !== expectedPort) throw new RemoteImageFetchError('unsafe_destination')

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname === 'localhost' || !hostname.includes('.')
    || /\.(?:localhost|local|internal|home|test|invalid)$/.test(hostname)) {
    throw new RemoteImageFetchError('unsafe_destination')
  }
  return hostname
}

async function lookupWithTimeout(hostname: string, timeoutMs: number) {
  const family = isIP(hostname)
  if (family) return [{ address: hostname, family }]

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      dnsLookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new RemoteImageFetchError('timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

type PinnedResponse = { status: number; location: string | null; body: Buffer }

function requestPinned(url: URL, hostname: string, address: { address: string; family: number }, maxBytes: number, timeoutMs: number): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
    const originalHost = url.port ? `${hostname}:${url.port}` : hostname
    const remaining = timeoutMs
    const request = requestFn({
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      headers: {
        Host: originalHost,
        Accept: 'image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'identity',
        Connection: 'close',
      },
      ...(url.protocol === 'https:' ? {
        servername: isIP(hostname) ? undefined : hostname,
        checkServerIdentity: (_ignoredHost: string, certificate: Parameters<typeof checkServerIdentity>[1]) => checkServerIdentity(hostname, certificate),
      } : {}),
    }, (response) => {
      const status = response.statusCode ?? 0
      const location = typeof response.headers.location === 'string' ? response.headers.location : null
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume()
        resolve({ status, location, body: Buffer.alloc(0) })
        return
      }
      if (status < 200 || status >= 300) {
        response.resume()
        resolve({ status, location: null, body: Buffer.alloc(0) })
        return
      }

      const statedLength = Number(response.headers['content-length'])
      if (Number.isFinite(statedLength) && statedLength > maxBytes) {
        response.destroy(new RemoteImageFetchError('too_large'))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer | Uint8Array) => {
        const buffer = Buffer.from(chunk)
        size += buffer.length
        if (size > maxBytes) {
          response.destroy(new RemoteImageFetchError('too_large'))
          return
        }
        chunks.push(buffer)
      })
      response.on('end', () => resolve({ status, location: null, body: Buffer.concat(chunks) }))
      response.on('error', reject)
    })

    const totalTimeout = setTimeout(() => request.destroy(new RemoteImageFetchError('timeout')), remaining)
    request.setTimeout(remaining, () => request.destroy(new RemoteImageFetchError('timeout')))
    request.on('close', () => clearTimeout(totalTimeout))
    request.on('error', (error) => reject(error instanceof RemoteImageFetchError ? error : new RemoteImageFetchError('fetch_failed')))
    request.end()
  })
}

export async function fetchSafeRemoteImage(
  input: string,
  maxBytes: number,
  dependencies: {
    lookup?: (hostname: string) => Promise<{ address: string; family: number }[]>
    request?: typeof requestPinned
  } = {}
) {
  const lookup = dependencies.lookup
  const makeRequest = dependencies.request ?? requestPinned
  let current: URL

  try {
    current = new URL(input)
  } catch {
    throw new RemoteImageFetchError('unsafe_destination')
  }

  const deadline = Date.now() + FETCH_TIMEOUT_MS
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw new RemoteImageFetchError('timeout')
    const hostname = validateRemoteImageUrl(current)
    const addresses = await (lookup ? lookup(hostname) : lookupWithTimeout(hostname, remainingMs))
    if (!addresses.length || addresses.some(({ address }) => !isPublicRemoteImageAddress(address))) {
      throw new RemoteImageFetchError('unsafe_destination')
    }

    const response = await makeRequest(current, hostname, addresses[0], maxBytes, remainingMs)
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (response.status < 200 || response.status >= 300) throw new RemoteImageFetchError('fetch_failed')
      if (response.body.byteLength > maxBytes) throw new RemoteImageFetchError('too_large')
      return response.body
    }
    if (!response.location || redirectCount === MAX_REDIRECTS) throw new RemoteImageFetchError('fetch_failed')
    try {
      current = new URL(response.location, current)
    } catch {
      throw new RemoteImageFetchError('unsafe_destination')
    }
  }

  throw new RemoteImageFetchError('fetch_failed')
}
