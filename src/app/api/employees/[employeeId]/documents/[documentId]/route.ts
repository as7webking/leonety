import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EMPLOYEE_DOCUMENT_BUCKET } from '@/lib/employee-documents'
import { authorizeEmployeeDocumentAccess } from '@/lib/employee-documents-server'

export const runtime = 'nodejs'

async function resolve(request: Request, context: { params: Promise<{ employeeId: string; documentId: string }> }) {
  const params = await context.params
  const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
  if (![companyId, params.employeeId, params.documentId].every((value) => z.string().uuid().safeParse(value).success)) return { response: NextResponse.json({ error: 'invalid_request' }, { status: 400 }) }
  const access = await authorizeEmployeeDocumentAccess(companyId, params.employeeId)
  if ('error' in access) return { response: NextResponse.json({ error: access.error }, { status: access.status }) }
  const { data, error } = await access.admin.from('employee_documents').select('id, storage_path, original_filename').eq('id', params.documentId).eq('company_id', companyId).eq('employee_id', params.employeeId).maybeSingle()
  if (error || !data) return { response: NextResponse.json({ error: 'document_not_found' }, { status: 404 }) }
  return { access, document: data }
}

export async function GET(request: Request, context: { params: Promise<{ employeeId: string; documentId: string }> }) {
  const resolved = await resolve(request, context)
  if ('response' in resolved) return resolved.response
  const { data, error } = await resolved.access.admin.storage.from(EMPLOYEE_DOCUMENT_BUCKET).createSignedUrl(resolved.document.storage_path, 60, { download: new URL(request.url).searchParams.get('download') === '1' ? resolved.document.original_filename : false })
  if (error) return NextResponse.json({ error: 'signed_url_failed' }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl, expiresIn: 60 })
}

export async function DELETE(request: Request, context: { params: Promise<{ employeeId: string; documentId: string }> }) {
  const resolved = await resolve(request, context)
  if ('response' in resolved) return resolved.response
  const { error } = await resolved.access.admin.from('employee_documents').delete().eq('id', resolved.document.id)
  if (error) return NextResponse.json({ error: 'document_delete_failed' }, { status: 500 })
  await resolved.access.admin.storage.from(EMPLOYEE_DOCUMENT_BUCKET).remove([resolved.document.storage_path])
  return new NextResponse(null, { status: 204 })
}
