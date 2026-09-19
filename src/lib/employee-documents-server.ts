import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function authorizeEmployeeDocumentAccess(companyId: string, employeeId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return { error: 'not_authenticated' as const, status: 401 as const }

  const admin = createSupabaseAdminClient()
  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', authData.user.id)
    .maybeSingle()
  if (companyError) return { error: 'workspace_check_failed' as const, status: 500 as const }
  if (!company) return { error: 'workspace_access_denied' as const, status: 403 as const }

  const { data: employee, error: employeeError } = await admin
    .from('employees')
    .select('id, company_id, country_code, employment_type, job_title')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (employeeError) return { error: 'employee_check_failed' as const, status: 500 as const }
  if (!employee) return { error: 'employee_not_found' as const, status: 404 as const }

  return { admin, user: authData.user, employee }
}
