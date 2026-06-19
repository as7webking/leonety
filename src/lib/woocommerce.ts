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
}

export function normalizeWooStoreUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  const url = new URL(trimmed)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Store URL must use HTTP or HTTPS.')
  }

  return url.origin + url.pathname.replace(/\/+$/, '')
}

export async function wooRequest<T>(
  connection: WooConnection,
  path: string,
  options: WooRequestOptions = {}
) {
  const storeUrl = normalizeWooStoreUrl(connection.store_url)
  const endpoint = `${storeUrl}/wp-json/wc/v3${path.startsWith('/') ? path : `/${path}`}`
  const auth = Buffer.from(`${connection.consumer_key}:${connection.consumer_secret}`).toString('base64')

  const response = await fetch(endpoint, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : `WooCommerce request failed with ${response.status}`
    throw new Error(message)
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
