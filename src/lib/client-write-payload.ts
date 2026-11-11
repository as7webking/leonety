import type { ClientFormValues } from './client-crm'

export function clientFormToWritePayload(companyId: string, form: ClientFormValues, updatedAt: string) {
  return {
    company_id: companyId,
    name: form.name.trim() || form.client_company.trim(),
    client_company: form.clientType === 'company' ? form.client_company.trim() || null : null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    street: form.street.trim() || null,
    house_number: form.house_number.trim() || null,
    postal_code: form.postal_code.trim() || null,
    city: form.city.trim() || null,
    country: form.country.trim() || null,
    tax_number: form.tax_number.trim() || null,
    vat_id: form.vat_id.trim() || null,
    interested_in: form.interested_in.trim() || null,
    notes: form.notes.trim() || null,
    status: form.status,
    updated_at: updatedAt,
  }
}
