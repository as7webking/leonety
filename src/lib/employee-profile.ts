export const employeeStatuses = ['active', 'inactive', 'on_leave'] as const
export const employmentTypes = ['full_time', 'part_time', 'minijob', 'freelance', 'contractor', 'other'] as const
export const compensationTypes = ['hourly', 'fixed'] as const

export type EmployeeStatus = typeof employeeStatuses[number]
export type EmploymentType = typeof employmentTypes[number]
export type CompensationType = typeof compensationTypes[number]
export type EmployeeCountryProfileValue = string | number | boolean | null
export interface EmployeeCountryProfile {
  version: 1
  modules: Record<string, Record<string, EmployeeCountryProfileValue>>
}

const emptyCountryProfile = (): EmployeeCountryProfile => ({ version: 1, modules: {} })

export interface EmployeeProfile {
  id: string
  company_id: string
  name: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  job_title: string
  employment_type: EmploymentType
  status: EmployeeStatus
  notes: string | null
  tax_id: string | null
  tax_class: string | null
  social_security_number: string | null
  nationality: string | null
  street: string | null
  house_number: string | null
  postal_code: string | null
  city: string | null
  country_code: string | null
  country_profile: EmployeeCountryProfile
  birth_date: string | null
  birth_place: string | null
  birth_country: string | null
  health_insurance_provider: string | null
  employment_start_date: string | null
  is_permanent: boolean
  fixed_term_end_date: string | null
  minijob_flat_tax_2_percent: boolean
  pension_insurance_exemption: boolean
  hours_per_week: number | null
  compensation_type: CompensationType | null
  hourly_wage: number | null
  fixed_salary: number | null
  compensation_currency: string | null
  annual_vacation_days: number | null
  created_at: string
  updated_at: string
}

export type EmployeeProfileForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
  job_title: string
  employment_type: EmploymentType
  status: EmployeeStatus
  notes: string
  tax_id: string
  tax_class: string
  social_security_number: string
  nationality: string
  street: string
  house_number: string
  postal_code: string
  city: string
  country_code: string
  country_profile: EmployeeCountryProfile
  birth_date: string
  birth_place: string
  birth_country: string
  health_insurance_provider: string
  employment_start_date: string
  is_permanent: boolean
  fixed_term_end_date: string
  minijob_flat_tax_2_percent: boolean
  pension_insurance_exemption: boolean
  hours_per_week: string
  compensation_type: CompensationType | ''
  hourly_wage: string
  fixed_salary: string
  compensation_currency: string
  annual_vacation_days: string
}

export const employeeProfileColumns = [
  'id', 'company_id', 'name', 'first_name', 'last_name', 'email', 'phone', 'job_title',
  'employment_type', 'status', 'notes', 'tax_id', 'tax_class', 'social_security_number',
  'nationality', 'street', 'house_number', 'postal_code', 'city', 'country_code', 'country_profile', 'birth_date', 'birth_place',
  'birth_country', 'health_insurance_provider', 'employment_start_date', 'is_permanent',
  'fixed_term_end_date', 'minijob_flat_tax_2_percent', 'pension_insurance_exemption',
  'hours_per_week', 'compensation_type', 'hourly_wage', 'fixed_salary',
  'compensation_currency', 'annual_vacation_days', 'created_at', 'updated_at',
].join(', ')

export function createEmptyEmployeeProfileForm(currency = 'EUR'): EmployeeProfileForm {
  return {
    first_name: '', last_name: '', email: '', phone: '', job_title: '', employment_type: 'full_time',
    status: 'active', notes: '', tax_id: '', tax_class: '', social_security_number: '', nationality: '',
    street: '', house_number: '', postal_code: '', city: '', country_code: '', country_profile: emptyCountryProfile(), birth_date: '', birth_place: '',
    birth_country: '', health_insurance_provider: '', employment_start_date: '', is_permanent: true,
    fixed_term_end_date: '', minijob_flat_tax_2_percent: false, pension_insurance_exemption: false,
    hours_per_week: '', compensation_type: '', hourly_wage: '', fixed_salary: '',
    compensation_currency: currency, annual_vacation_days: '',
  }
}

export function employeeProfileToForm(employee: EmployeeProfile): EmployeeProfileForm {
  return {
    ...createEmptyEmployeeProfileForm(employee.compensation_currency ?? 'EUR'),
    first_name: employee.first_name ?? '', last_name: employee.last_name ?? '', email: employee.email ?? '',
    phone: employee.phone ?? '', job_title: employee.job_title, employment_type: employee.employment_type,
    status: employee.status, notes: employee.notes ?? '', tax_id: employee.tax_id ?? '',
    tax_class: employee.tax_class ?? '', social_security_number: employee.social_security_number ?? '',
    nationality: employee.nationality ?? '', street: employee.street ?? '', house_number: employee.house_number ?? '',
    postal_code: employee.postal_code ?? '', city: employee.city ?? '', country_code: employee.country_code ?? '',
    country_profile: employee.country_profile ?? emptyCountryProfile(), birth_date: employee.birth_date ?? '',
    birth_place: employee.birth_place ?? '', birth_country: employee.birth_country ?? '',
    health_insurance_provider: employee.health_insurance_provider ?? '',
    employment_start_date: employee.employment_start_date ?? '', is_permanent: employee.is_permanent,
    fixed_term_end_date: employee.fixed_term_end_date ?? '',
    minijob_flat_tax_2_percent: employee.minijob_flat_tax_2_percent,
    pension_insurance_exemption: employee.pension_insurance_exemption,
    hours_per_week: employee.hours_per_week?.toString() ?? '', compensation_type: employee.compensation_type ?? '',
    hourly_wage: employee.hourly_wage?.toString() ?? '', fixed_salary: employee.fixed_salary?.toString() ?? '',
    annual_vacation_days: employee.annual_vacation_days?.toString() ?? '',
  }
}

function nullableText(value: string) {
  return value.trim() || null
}

function nullableNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeEmployeeCountryCode(value: string) {
  return value.trim().toUpperCase()
}

export function isGermanyEmployeeProfile(employee: Pick<EmployeeProfile,
  'country_code' | 'tax_id' | 'tax_class' | 'social_security_number' | 'health_insurance_provider' | 'employment_type'
>) {
  const countryCode = normalizeEmployeeCountryCode(employee.country_code ?? '')
  if (countryCode) return countryCode === 'DE'

  return employee.employment_type === 'minijob'
    || Boolean(employee.tax_id || employee.tax_class || employee.social_security_number || employee.health_insurance_provider)
}

export function buildEmployeeProfilePayload(form: EmployeeProfileForm, companyId: string) {
  const firstName = form.first_name.trim()
  const lastName = form.last_name.trim()
  const isMinijob = form.employment_type === 'minijob'
  const countryCode = normalizeEmployeeCountryCode(form.country_code)

  return {
    company_id: companyId,
    name: [firstName, lastName].filter(Boolean).join(' '),
    first_name: firstName || null,
    last_name: lastName || null,
    email: nullableText(form.email), phone: nullableText(form.phone), job_title: form.job_title.trim(),
    employment_type: form.employment_type, status: form.status, notes: nullableText(form.notes),
    tax_id: nullableText(form.tax_id), tax_class: nullableText(form.tax_class),
    social_security_number: nullableText(form.social_security_number), nationality: nullableText(form.nationality),
    street: nullableText(form.street), house_number: nullableText(form.house_number),
    postal_code: nullableText(form.postal_code), city: nullableText(form.city), country_code: countryCode || null,
    country_profile: form.country_profile,
    birth_date: form.birth_date || null, birth_place: nullableText(form.birth_place),
    birth_country: nullableText(form.birth_country), health_insurance_provider: nullableText(form.health_insurance_provider),
    employment_start_date: form.employment_start_date || null, is_permanent: form.is_permanent,
    fixed_term_end_date: form.is_permanent ? null : (form.fixed_term_end_date || null),
    minijob_flat_tax_2_percent: isMinijob && form.minijob_flat_tax_2_percent,
    pension_insurance_exemption: isMinijob && form.pension_insurance_exemption,
    hours_per_week: nullableNumber(form.hours_per_week), compensation_type: form.compensation_type || null,
    hourly_wage: form.compensation_type === 'hourly' ? nullableNumber(form.hourly_wage) : null,
    fixed_salary: form.compensation_type === 'fixed' ? nullableNumber(form.fixed_salary) : null,
    compensation_currency: form.compensation_type ? form.compensation_currency : null,
    annual_vacation_days: nullableNumber(form.annual_vacation_days), updated_at: new Date().toISOString(),
  }
}
