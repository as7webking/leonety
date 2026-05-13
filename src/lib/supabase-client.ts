import { createBrowserClient } from '@supabase/ssr'

function validateEnvVars() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing required Supabase environment variables')
  }

  return { url, key }
}

export function createClient() {
  const { url, key } = validateEnvVars()
  return createBrowserClient(url, key)
}
