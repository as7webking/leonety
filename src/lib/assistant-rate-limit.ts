interface RateLimitBucket {
  count: number
  resetAt: number
}

export function createAssistantRateLimiter({
  windowMs,
  maxRequests,
  maxEntries = 10_000,
}: {
  windowMs: number
  maxRequests: number
  maxEntries?: number
}) {
  const buckets = new Map<string, RateLimitBucket>()

  return (key: string, now = Date.now()) => {
    if (buckets.size >= maxEntries) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey)
      }
      if (buckets.size >= maxEntries) buckets.delete(buckets.keys().next().value as string)
    }

    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (current.count >= maxRequests) return false
    current.count += 1
    return true
  }
}
