import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

function getConfiguredAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase()
    || process.env.UPGRADE_REQUEST_ADMIN_EMAIL?.trim().toLowerCase()
    || null
}

export async function isLeonetyOperatorAdmin(user: Pick<User, 'id' | 'email'>) {
  const configuredAdminEmail = getConfiguredAdminEmail()
  const authenticatedEmail = user.email?.trim().toLowerCase() ?? null

  if (configuredAdminEmail && authenticatedEmail === configuredAdminEmail) {
    return true
  }

  const adminSupabase = createSupabaseAdminClient()
  const { data, error } = await adminSupabase
    .from('admin_accounts')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}
