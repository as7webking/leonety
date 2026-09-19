export const EMPLOYEE_DOCUMENT_BUCKET = 'employee-documents'
export const EMPLOYEE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const EMPLOYEE_DOCUMENT_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

export type EmployeeDocumentStatus = 'missing' | 'uploaded' | 'expiring_soon' | 'expired'

export interface EmployeeDocumentRow {
  id: string
  company_id: string
  employee_id: string
  requirement_id: string | null
  document_type: string
  display_name: string
  original_filename: string
  mime_type: string
  size_bytes: number
  issue_date: string | null
  expiration_date: string | null
  document_reference: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeDocumentRequirement {
  id: string
  company_id: string
  employee_id: string
  document_type: string
  name: string
  country_code: string | null
  job_role: string | null
  is_required: boolean
  created_at: string
}

export function getEmployeeDocumentStatus(
  document: Pick<EmployeeDocumentRow, 'expiration_date'> | null | undefined,
  now = new Date(),
): EmployeeDocumentStatus {
  if (!document) return 'missing'
  if (!document.expiration_date) return 'uploaded'

  const expiration = new Date(`${document.expiration_date}T23:59:59.999Z`)
  if (expiration.getTime() < now.getTime()) return 'expired'

  const warningAt = new Date(now)
  warningAt.setUTCDate(warningAt.getUTCDate() + 30)
  return expiration.getTime() <= warningAt.getTime() ? 'expiring_soon' : 'uploaded'
}

export function sanitizeEmployeeDocumentFilename(filename: string) {
  const normalized = filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
  return normalized.replace(/^[-.]+|[-.]+$/g, '').slice(0, 120) || 'document'
}

export function isEmployeeDocumentMigrationError(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}
