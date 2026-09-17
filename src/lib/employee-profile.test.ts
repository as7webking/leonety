import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildEmployeeProfilePayload, createEmptyEmployeeProfileForm } from './employee-profile.ts'

test('builds a structured display name and preserves identifiers as text', () => {
  const form = createEmptyEmployeeProfileForm('EUR')
  form.first_name = 'Ada'
  form.last_name = 'Lovelace'
  form.job_title = 'Developer'
  form.tax_id = '00123456789'
  form.social_security_number = '00 123456 A 000'
  const payload = buildEmployeeProfilePayload(form, 'company-id')

  assert.equal(payload.name, 'Ada Lovelace')
  assert.equal(payload.tax_id, '00123456789')
  assert.equal(payload.social_security_number, '00 123456 A 000')
})

test('normalizes fixed-term, minijob and compensation dependent fields', () => {
  const form = createEmptyEmployeeProfileForm('EUR')
  form.first_name = 'Max'
  form.last_name = 'Mustermann'
  form.job_title = 'Service'
  form.is_permanent = false
  form.fixed_term_end_date = '2027-12-31'
  form.employment_type = 'minijob'
  form.minijob_flat_tax_2_percent = true
  form.pension_insurance_exemption = true
  form.compensation_type = 'hourly'
  form.hourly_wage = '14,50'
  form.fixed_salary = '9999'
  const payload = buildEmployeeProfilePayload(form, 'company-id')

  assert.equal(payload.fixed_term_end_date, '2027-12-31')
  assert.equal(payload.minijob_flat_tax_2_percent, true)
  assert.equal(payload.pension_insurance_exemption, true)
  assert.equal(payload.hourly_wage, 14.5)
  assert.equal(payload.fixed_salary, null)
})

test('clears minijob and fixed-term options when their parent choices are disabled', () => {
  const form = createEmptyEmployeeProfileForm('EUR')
  form.first_name = 'Jane'
  form.last_name = 'Doe'
  form.job_title = 'Manager'
  form.fixed_term_end_date = '2027-12-31'
  form.minijob_flat_tax_2_percent = true
  form.pension_insurance_exemption = true
  const payload = buildEmployeeProfilePayload(form, 'company-id')

  assert.equal(payload.fixed_term_end_date, null)
  assert.equal(payload.minijob_flat_tax_2_percent, false)
  assert.equal(payload.pension_insurance_exemption, false)
})
