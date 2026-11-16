import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getFxRate } from './fx-provider-core.ts'

test('Frankfurter request pins the requested historical date and accepts a preceding effective date', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input)
    return Response.json({ base: 'AZN', quote: 'EUR', rate: 0.54, date: '2026-09-29' })
  }) as typeof fetch
  try {
    const result = await getFxRate('AZN', 'EUR', undefined, '2026-09-30')
    assert.equal(new URL(requestedUrl).searchParams.get('date'), '2026-09-30')
    assert.equal(result.rateDate, '2026-09-29')
    assert.equal(result.provider, 'frankfurter')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Frankfurter rejects invalid pair, invalid rate, invalid date and a future rate date', async () => {
  const originalFetch = globalThis.fetch
  const cases = [
    { base: 'EUR', quote: 'AZN', rate: 1.8, date: '2026-09-30' },
    { base: 'AZN', quote: 'EUR', rate: 0, date: '2026-09-30' },
    { base: 'AZN', quote: 'EUR', rate: 0.54, date: '2026-02-30' },
    { base: 'AZN', quote: 'EUR', rate: 0.54, date: '2026-12-30' },
  ]
  try {
    for (const [index, payload] of cases.entries()) {
      const requestedDate = `2026-10-${String(index + 2).padStart(2, '0')}`
      globalThis.fetch = (async () => Response.json(payload)) as typeof fetch
      await assert.rejects(getFxRate('AZN', 'EUR', undefined, requestedDate))
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('unavailable pair and provider timeout fail without returning a substitute rate', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch
    await assert.rejects(getFxRate('AZN', 'EUR', undefined, '2025-01-02'))

    globalThis.fetch = (async () => { throw new DOMException('timeout', 'TimeoutError') }) as typeof fetch
    await assert.rejects(getFxRate('AZN', 'EUR', undefined, '2025-01-03'))
  } finally {
    globalThis.fetch = originalFetch
  }
})
