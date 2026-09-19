import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeEmployeeDocumentAccess } from '@/lib/employee-documents-server'
import { isEmployeeDocumentMigrationError } from '@/lib/employee-documents'

export const runtime = 'nodejs'

export async function PUT(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await context.params
  const parsed = z.object({ companyId: z.string().uuid(), hasDrivingLicence: z.boolean().nullable() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(employeeId).success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const access = await authorizeEmployeeDocumentAccess(parsed.data.companyId, employeeId)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  const { error } = await access.admin.from('employee_document_settings').upsert({
    company_id: parsed.data.companyId, employee_id: employeeId,
    has_driving_licence: parsed.data.hasDrivingLicence, updated_by: access.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'employee_id' })
  if (error) return NextResponse.json({ error: isEmployeeDocumentMigrationError(error) ? 'migration_required' : 'settings_save_failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
