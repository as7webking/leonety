export interface EmployeeNumberSettings {
  company_id: string
  require_employee_number: boolean
  automatic_numbering: boolean
  number_prefix: string
  next_number: number
  minimum_digits: number
}

export const createDefaultEmployeeNumberSettings = (companyId: string): EmployeeNumberSettings => ({
  company_id: companyId,
  require_employee_number: false,
  automatic_numbering: false,
  number_prefix: '',
  next_number: 1,
  minimum_digits: 1,
})

export function isEmployeeNumberSchemaUnavailable(error: { code?: string | null } | null | undefined) {
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code ?? '')
}

export function formatEmployeeNumberPreview(prefix: string, nextNumber: number, minimumDigits: number) {
  const safeNumber = Math.max(1, Math.trunc(nextNumber) || 1)
  const safeDigits = Math.min(12, Math.max(1, Math.trunc(minimumDigits) || 1))
  return `${prefix.trim()}${String(safeNumber).padStart(safeDigits, '0')}`
}
