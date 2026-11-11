import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { toWorkspaceLegalUpdate, workspaceLegalColumns } from '@/lib/workspace-legal-settings'

export const runtime = 'nodejs'

const legalFieldSchema = z.string().trim().max(4000)
const legalSettingsSchema = z.object({
  companyId: z.string().uuid(),
  legal_name: legalFieldSchema.max(240),
  legal_form: legalFieldSchema.max(240),
  legal_representative: legalFieldSchema.max(240),
  legal_street: legalFieldSchema.max(240),
  legal_house_number: legalFieldSchema.max(80),
  legal_postal_code: legalFieldSchema.max(40),
  legal_city: legalFieldSchema.max(160),
  legal_country_code: legalFieldSchema.max(160),
  legal_email: legalFieldSchema.max(320).refine((value) => !value || z.string().email().safeParse(value).success),
  legal_phone: legalFieldSchema.max(80),
  vat_id: legalFieldSchema.max(120),
  tax_number: legalFieldSchema.max(120),
  account_holder: legalFieldSchema.max(240),
  bank_name: legalFieldSchema.max(240),
  iban: legalFieldSchema.max(80),
  bic: legalFieldSchema.max(40),
  payment_terms: legalFieldSchema.max(2000),
  commercial_register: legalFieldSchema.max(240),
  register_court: legalFieldSchema.max(240),
  registration_number: legalFieldSchema.max(160),
  professional_regulatory_info: legalFieldSchema,
  additional_legal_text: legalFieldSchema,
})

function legalError(operation: 'load' | 'save', error: unknown) {
  console.error(`[workspace-legal] ${operation} failed`, {
    message: error instanceof Error ? error.message : 'Database operation failed',
  })
  return NextResponse.json({ error: `legal_${operation}_failed` }, { status: 500 })
}

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
  const parsed = z.string().uuid().safeParse(companyId)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const auth = await requireOwnedCompany(parsed.data)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.adminSupabase
    .from('companies')
    .select(workspaceLegalColumns.join(','))
    .eq('id', parsed.data)
    .eq('owner_id', auth.user.id)
    .maybeSingle()

  if (error) return legalError('load', error)
  if (!data) return NextResponse.json({ error: 'workspace_not_found' }, { status: 404 })

  return NextResponse.json({ legal: data })
}

export async function PATCH(request: Request) {
  const parsed = legalSettingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.adminSupabase
    .from('companies')
    .update({ ...toWorkspaceLegalUpdate(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', parsed.data.companyId)
    .eq('owner_id', auth.user.id)
    .select(workspaceLegalColumns.join(','))
    .maybeSingle()

  if (error) return legalError('save', error)
  if (!data) return NextResponse.json({ error: 'workspace_not_found' }, { status: 404 })

  return NextResponse.json({ legal: data })
}
