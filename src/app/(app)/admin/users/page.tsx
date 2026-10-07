import { redirect } from 'next/navigation'
import { AdminUsersClient } from '@/components/admin/admin-users-client'
import { isLeonetyOperatorAdmin } from '@/lib/admin-authorization'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function AdminUsersPage() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) redirect('/login')
  if (!await isLeonetyOperatorAdmin(data.user)) redirect('/app/dashboard')

  return <AdminUsersClient />
}
