const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const MUTATING_SUPABASE_PATHS = ['/rest/v1/', '/storage/v1/', '/functions/v1/']

export function shouldBlockOfflineSupabaseRequest({
  requestUrl,
  method,
  supabaseUrl,
  isOnline,
}: {
  requestUrl: string
  method: string
  supabaseUrl: string
  isOnline: boolean
}) {
  if (isOnline || !MUTATING_METHODS.has(method.toUpperCase())) return false

  try {
    const request = new URL(requestUrl)
    const supabase = new URL(supabaseUrl)
    return request.origin === supabase.origin && MUTATING_SUPABASE_PATHS.some((path) => request.pathname.startsWith(path))
  } catch {
    return false
  }
}

export function createOfflineSafeFetch(supabaseUrl: string): typeof fetch {
  return async (input, init) => {
    const requestUrl = input instanceof Request ? input.url : String(input)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const isOnline = typeof navigator === 'undefined' || navigator.onLine

    if (shouldBlockOfflineSupabaseRequest({ requestUrl, method, supabaseUrl, isOnline })) {
      throw new TypeError('offline_mutation_blocked')
    }

    return fetch(input, init)
  }
}
