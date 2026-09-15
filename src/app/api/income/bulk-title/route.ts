import { NextResponse } from 'next/server'
import { bulkIncomeTitleRequestSchema } from '@/lib/income-bulk-title'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }

    const parsed = bulkIncomeTitleRequestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    const { companyId, incomeIds, title } = parsed.data
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('owner_id', authData.user.id)
      .maybeSingle()

    if (companyError) {
      return NextResponse.json({ error: 'workspace_check_failed' }, { status: 500 })
    }
    if (!company) {
      return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    }

    const { data: accessibleRows, error: lookupError } = await supabase
      .from('incomes')
      .select('id')
      .eq('company_id', companyId)
      .in('id', incomeIds)

    if (lookupError) {
      return NextResponse.json({ error: 'income_lookup_failed' }, { status: 500 })
    }

    const accessibleIds = new Set((accessibleRows ?? []).map((row) => row.id))
    if (accessibleIds.size !== incomeIds.length || incomeIds.some((id) => !accessibleIds.has(id))) {
      return NextResponse.json({ error: 'income_access_denied' }, { status: 403 })
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from('incomes')
      .update({ title })
      .eq('company_id', companyId)
      .in('id', incomeIds)
      .select('id')

    if (updateError) {
      return NextResponse.json({ error: 'income_update_failed' }, { status: 500 })
    }

    const updatedIds = new Set((updatedRows ?? []).map((row) => row.id))
    if (updatedIds.size !== incomeIds.length || incomeIds.some((id) => !updatedIds.has(id))) {
      return NextResponse.json({ error: 'income_update_incomplete' }, { status: 409 })
    }

    return NextResponse.json({ updatedCount: updatedIds.size })
  } catch {
    return NextResponse.json({ error: 'income_update_failed' }, { status: 500 })
  }
}
