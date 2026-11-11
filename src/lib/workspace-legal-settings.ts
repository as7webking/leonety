export const workspaceLegalColumns = [
  'legal_name',
  'legal_form',
  'legal_representative',
  'legal_street',
  'legal_house_number',
  'legal_postal_code',
  'legal_city',
  'legal_country_code',
  'legal_email',
  'legal_phone',
  'vat_id',
  'tax_number',
  'account_holder',
  'bank_name',
  'iban',
  'bic',
  'payment_terms',
  'commercial_register',
  'register_court',
  'registration_number',
  'professional_regulatory_info',
  'additional_legal_text',
] as const

export type WorkspaceLegalColumn = typeof workspaceLegalColumns[number]

export function toWorkspaceLegalUpdate(
  values: Partial<Record<WorkspaceLegalColumn, string | null | undefined>>,
): Record<WorkspaceLegalColumn, string | null> {
  return Object.fromEntries(
    workspaceLegalColumns.map((column) => {
      const value = values[column]?.trim()
      return [column, value || null]
    }),
  ) as Record<WorkspaceLegalColumn, string | null>
}
