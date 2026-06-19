import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface CompanyRow {
  id: string
  owner_id: string
}

export async function requireOwnedCompany(companyId: string) {
  if (!companyId) {
    return { error: NextResponse.json({ error: 'Workspace is required.' }, { status: 400 }) }
  }

  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) }
  }

  const adminSupabase = createSupabaseAdminClient()
  const { data: company, error: companyError } = await adminSupabase
    .from('companies')
    .select('id, owner_id')
    .eq('id', companyId)
    .eq('owner_id', authData.user.id)
    .maybeSingle()

  if (companyError) {
    return { error: NextResponse.json({ error: companyError.message }, { status: 500 }) }
  }

  if (!company) {
    return { error: NextResponse.json({ error: 'Workspace access denied.' }, { status: 403 }) }
  }

  return { user: authData.user, company: company as CompanyRow, adminSupabase }
}

export function formatApiError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const record = error as { message?: string; details?: string; hint?: string; code?: string }
    return [record.message, record.details, record.hint, record.code ? `Code: ${record.code}` : '']
      .filter(Boolean)
      .join(' · ')
  }

  return 'Unknown error'
}
