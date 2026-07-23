import 'server-only'
import { Buffer } from 'node:buffer'

export interface WooConnection {
  store_url: string
  consumer_key: string
  consumer_secret: string
}

export interface WooProductPayload {
  name: string
  type?: 'simple' | 'variable'
  description?: string
  short_description?: string
  sku?: string
  regular_price?: string
  manage_stock?: boolean
  stock_quantity?: number
  categories?: Array<{ id: number }>
  images?: Array<{ src: string }>
  attributes?: Array<{
    name: string
    options: string[]
    variation?: boolean
    visible?: boolean
  }>
  meta_data?: Array<{ key: string; value: string }>
}

export interface WooVariationPayload {
  regular_price?: string
  sku?: string
  manage_stock?: boolean
  stock_quantity?: number
  attributes: Array<{ name: string; option: string }>
}

interface WooRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  timeoutMs?: number
}

export function normalizeWooStoreUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Store URL must use HTTP or HTTPS.')
  }

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Store URL must use HTTPS in production.')
  }

  return url.origin + url.pathname.replace(/\/+$/, '')
}

function parseWooResponse(text: string) {
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function friendlyWooError(status: number, data: unknown) {
  const record = data && typeof data === 'object' ? data as { message?: string; code?: string } : {}
  const rawMessage = typeof record.message === 'string' ? record.message : `WooCommerce request failed with ${status}.`
  const lower = rawMessage.toLowerCase()

  if (status === 401) {
    return 'WooCommerce rejected the credentials. Check the Consumer Key and Consumer Secret.'
  }
  if (status === 403 || /schreibrechte|write permission|read\/write|cannot create|cannot edit/i.test(rawMessage)) {
    return `${rawMessage} Make sure the WooCommerce REST API key has Read/Write permissions.`
  }
  if (status === 404 || lower.includes('rest_no_route')) {
    return 'WooCommerce REST API endpoint was not found. Check that WooCommerce is installed and REST API is enabled.'
  }
  if (status >= 500) {
    return 'WooCommerce returned a server error. Check the store health, security plugins, and REST API availability.'
  }

  return rawMessage
}

export async function wooRequest<T>(
  connection: WooConnection,
  path: string,
  options: WooRequestOptions = {}
) {
  const storeUrl = normalizeWooStoreUrl(connection.store_url)
  const endpoint = `${storeUrl}/wp-json/wc/v3${path.startsWith('/') ? path : `/${path}`}`
  const auth = Buffer.from(`${connection.consumer_key}:${connection.consumer_secret}`).toString('base64')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000)

  let response: Response

  try {
    response = await fetch(endpoint, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('WooCommerce request timed out. Check the store URL and hosting firewall.')
    }

    throw new Error('WooCommerce store could not be reached. Check the URL, DNS, SSL certificate, and firewall.')
  } finally {
    clearTimeout(timeout)
  }

  const text = await response.text()
  const data = parseWooResponse(text)

  if (!response.ok) {
    throw new Error(friendlyWooError(response.status, data))
  }

  return data as T
}

export function toWooPrice(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, value).toFixed(2)
}

export function toWooStock(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.floor(value))
}
