import 'server-only'
import { createClient } from '@supabase/supabase-js'

function validateAdminEnvVars() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase service role environment variables')
  }

  return { url, key }
}

export function createSupabaseAdminClient() {
  const { url, key } = validateAdminEnvVars()

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
