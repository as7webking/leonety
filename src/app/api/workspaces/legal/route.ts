import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'

export const runtime = 'nodejs'

const legalFieldSchema = z.string().trim().max(4000)
const legalSettingsSchema = z.object({
  companyId: z.string().uuid(),
  legal_name: legalFieldSchema.max(240),
  legal_representative: legalFieldSchema.max(240),
  legal_street: legalFieldSchema.max(240),
  legal_house_number: legalFieldSchema.max(80),
  legal_postal_code: legalFieldSchema.max(40),
  legal_city: legalFieldSchema.max(160),
  legal_country_code: legalFieldSchema.max(160),
  legal_email: legalFieldSchema.max(320).refine((value) => !value || z.string().email().safeParse(value).success),
  legal_phone: legalFieldSchema.max(80),
  vat_id: legalFieldSchema.max(120),
  commercial_register: legalFieldSchema.max(240),
  register_court: legalFieldSchema.max(240),
  registration_number: legalFieldSchema.max(160),
  professional_regulatory_info: legalFieldSchema,
  additional_legal_text: legalFieldSchema,
})

const legalColumns = [
  'legal_name',
  'legal_representative',
  'legal_street',
  'legal_house_number',
  'legal_postal_code',
  'legal_city',
  'legal_country_code',
  'legal_email',
  'legal_phone',
  'vat_id',
  'commercial_register',
  'register_court',
  'registration_number',
  'professional_regulatory_info',
  'additional_legal_text',
] as const

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
    .select(legalColumns.join(','))
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

  const updates = Object.fromEntries(
    legalColumns.map((column) => [column, parsed.data[column] || null]),
  )

  const { data, error } = await auth.adminSupabase
    .from('companies')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.companyId)
    .eq('owner_id', auth.user.id)
    .select(legalColumns.join(','))
    .maybeSingle()

  if (error) return legalError('save', error)
  if (!data) return NextResponse.json({ error: 'workspace_not_found' }, { status: 404 })

  return NextResponse.json({ legal: data })
}
