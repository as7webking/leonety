import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeEmployeeDocumentAccess } from '@/lib/employee-documents-server'
import { isEmployeeDocumentMigrationError } from '@/lib/employee-documents'

export const runtime = 'nodejs'

const schema = z.object({
  companyId: z.string().uuid(), name: z.string().trim().min(1).max(160),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  jobRole: z.string().trim().max(120).nullable().optional(), isRequired: z.boolean(),
})

export async function POST(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await context.params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(employeeId).success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const access = await authorizeEmployeeDocumentAccess(parsed.data.companyId, employeeId)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const id = crypto.randomUUID()
  const { data, error } = await access.admin.from('employee_document_requirements').insert({
    id, company_id: parsed.data.companyId, employee_id: employeeId, document_type: `custom:${id}`,
    name: parsed.data.name, country_code: parsed.data.countryCode || null, job_role: parsed.data.jobRole || null,
    is_required: parsed.data.isRequired, created_by: access.user.id,
  }).select('id, company_id, employee_id, document_type, name, country_code, job_role, is_required, created_at').single()
  if (error) return NextResponse.json({ error: isEmployeeDocumentMigrationError(error) ? 'migration_required' : 'requirement_save_failed' }, { status: 500 })
  return NextResponse.json({ requirement: data }, { status: 201 })
}

export async function DELETE(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await context.params
  const parsed = z.object({ companyId: z.string().uuid(), requirementId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(employeeId).success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const access = await authorizeEmployeeDocumentAccess(parsed.data.companyId, employeeId)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  const { count, error } = await access.admin.from('employee_documents').select('id', { count: 'exact', head: true }).eq('requirement_id', parsed.data.requirementId).eq('company_id', parsed.data.companyId).eq('employee_id', employeeId)
  if (error) return NextResponse.json({ error: 'requirement_check_failed' }, { status: 500 })
  if (count) return NextResponse.json({ error: 'requirement_has_document' }, { status: 409 })
  const result = await access.admin.from('employee_document_requirements').delete().eq('id', parsed.data.requirementId).eq('company_id', parsed.data.companyId).eq('employee_id', employeeId)
  if (result.error) return NextResponse.json({ error: 'requirement_delete_failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
