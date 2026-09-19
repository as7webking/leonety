import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  EMPLOYEE_DOCUMENT_ALLOWED_TYPES,
  EMPLOYEE_DOCUMENT_BUCKET,
  EMPLOYEE_DOCUMENT_MAX_BYTES,
  isEmployeeDocumentMigrationError,
  sanitizeEmployeeDocumentFilename,
} from '@/lib/employee-documents'
import { authorizeEmployeeDocumentAccess } from '@/lib/employee-documents-server'

export const runtime = 'nodejs'

const querySchema = z.object({ companyId: z.string().uuid() })
const textDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(''))

export async function GET(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await context.params
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success || !z.string().uuid().safeParse(employeeId).success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const access = await authorizeEmployeeDocumentAccess(parsed.data.companyId, employeeId)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const [documents, requirements, settings] = await Promise.all([
    access.admin.from('employee_documents').select('id, company_id, employee_id, requirement_id, document_type, display_name, original_filename, mime_type, size_bytes, issue_date, expiration_date, document_reference, created_at, updated_at').eq('company_id', parsed.data.companyId).eq('employee_id', employeeId).order('updated_at', { ascending: false }),
    access.admin.from('employee_document_requirements').select('id, company_id, employee_id, document_type, name, country_code, job_role, is_required, created_at').eq('company_id', parsed.data.companyId).eq('employee_id', employeeId).order('created_at'),
    access.admin.from('employee_document_settings').select('has_driving_licence').eq('company_id', parsed.data.companyId).eq('employee_id', employeeId).maybeSingle(),
  ])
  const error = documents.error || requirements.error || settings.error
  if (error) return NextResponse.json({ error: isEmployeeDocumentMigrationError(error) ? 'migration_required' : 'documents_load_failed' }, { status: 500 })

  return NextResponse.json({
    documents: documents.data ?? [],
    requirements: requirements.data ?? [],
    hasDrivingLicence: settings.data?.has_driving_licence ?? null,
  })
}

export async function POST(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await context.params
  const form = await request.formData().catch(() => null)
  const companyId = form?.get('companyId')
  const file = form?.get('file')
  const fields = {
    companyId,
    documentType: form?.get('documentType'),
    displayName: form?.get('displayName'),
    requirementId: form?.get('requirementId') || null,
    issueDate: form?.get('issueDate') || '',
    expirationDate: form?.get('expirationDate') || '',
    documentReference: form?.get('documentReference') || '',
  }
  const parsed = z.object({
    companyId: z.string().uuid(), documentType: z.string().trim().min(1).max(120), displayName: z.string().trim().min(1).max(160),
    requirementId: z.string().uuid().nullable(), issueDate: textDate, expirationDate: textDate, documentReference: z.string().trim().max(160),
  }).safeParse(fields)
  if (!parsed.success || !z.string().uuid().safeParse(employeeId).success || !(file instanceof File)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (!EMPLOYEE_DOCUMENT_ALLOWED_TYPES.includes(file.type as typeof EMPLOYEE_DOCUMENT_ALLOWED_TYPES[number])) {
    return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > EMPLOYEE_DOCUMENT_MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
  }

  const access = await authorizeEmployeeDocumentAccess(parsed.data.companyId, employeeId)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  if (parsed.data.requirementId) {
    const { data: requirement } = await access.admin.from('employee_document_requirements').select('id').eq('id', parsed.data.requirementId).eq('company_id', parsed.data.companyId).eq('employee_id', employeeId).maybeSingle()
    if (!requirement) return NextResponse.json({ error: 'requirement_not_found' }, { status: 404 })
  }

  const safeName = sanitizeEmployeeDocumentFilename(file.name)
  const storagePath = `${parsed.data.companyId}/${employeeId}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await access.admin.storage.from(EMPLOYEE_DOCUMENT_BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: 'document_upload_failed' }, { status: 500 })

  const { data: existing } = await access.admin.from('employee_documents').select('id, storage_path').eq('company_id', parsed.data.companyId).eq('employee_id', employeeId).eq('document_type', parsed.data.documentType).maybeSingle()
  const values = {
    company_id: parsed.data.companyId, employee_id: employeeId, requirement_id: parsed.data.requirementId,
    document_type: parsed.data.documentType, display_name: parsed.data.displayName, storage_path: storagePath,
    original_filename: file.name.slice(0, 255), mime_type: file.type, size_bytes: file.size,
    issue_date: parsed.data.issueDate || null, expiration_date: parsed.data.expirationDate || null,
    document_reference: parsed.data.documentReference || null, uploaded_by: access.user.id, updated_at: new Date().toISOString(),
  }
  const result = existing
    ? await access.admin.from('employee_documents').update(values).eq('id', existing.id).eq('company_id', parsed.data.companyId).select('id').single()
    : await access.admin.from('employee_documents').insert(values).select('id').single()
  if (result.error) {
    await access.admin.storage.from(EMPLOYEE_DOCUMENT_BUCKET).remove([storagePath])
    return NextResponse.json({ error: isEmployeeDocumentMigrationError(result.error) ? 'migration_required' : 'document_save_failed' }, { status: 500 })
  }
  if (existing?.storage_path) await access.admin.storage.from(EMPLOYEE_DOCUMENT_BUCKET).remove([existing.storage_path])
  return NextResponse.json({ id: result.data.id }, { status: existing ? 200 : 201 })
}
