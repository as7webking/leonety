'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/i18n-context'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'
import {
  buildEmployeeProfilePayload,
  compensationTypes,
  createEmptyEmployeeProfileForm,
  employeeProfileToForm,
  employeeStatuses,
  employmentTypes,
  isGermanyEmployeeProfile,
  normalizeEmployeeCountryCode,
  type CompensationType,
  type EmployeeProfile,
  type EmployeeProfileForm as FormState,
  type EmployeeStatus,
  type EmploymentType,
} from '@/lib/employee-profile'
import { getIntlLocale } from '@/lib/i18n'
import { createClient } from '@/lib/supabase-client'

interface Props {
  companyId: string
  currency: string | null
  employee?: EmployeeProfile
}

const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm'
const suggestedCountryCodes = [
  'DE', 'AT', 'CH', 'FR', 'PL', 'TR', 'UA', 'GB', 'IE', 'NL', 'BE', 'LU', 'ES', 'PT',
  'IT', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'DK', 'SE', 'NO', 'FI', 'US', 'CA', 'AU',
  'NZ', 'IN', 'CN', 'JP', 'BR', 'MX', 'ZA', 'AE',
]

export function EmployeeProfileForm({ companyId, currency, employee }: Props) {
  const router = useRouter()
  const { locale, t } = useI18n()
  const [supabase] = useState(() => createClient())
  const initial = useMemo(() => employee
    ? employeeProfileToForm(employee)
    : createEmptyEmployeeProfileForm(normalizeCurrencyCode(currency ?? 'EUR')), [currency, employee])
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const normalizedCountryCode = normalizeEmployeeCountryCode(form.country_code)
  const showGermanyExtension = normalizedCountryCode === 'DE'
    || (!normalizedCountryCode && Boolean(employee && isGermanyEmployeeProfile(employee)))
  const visibleEmploymentTypes = employmentTypes.filter((value) => value !== 'minijob'
    || showGermanyExtension
    || form.employment_type === 'minijob')
  const countryDisplayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([getIntlLocale(locale)], { type: 'region' })
    } catch {
      return null
    }
  }, [locale])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')

    if (!form.first_name.trim() || !form.last_name.trim() || !form.job_title.trim()) {
      setError(t('employees.profile.required'))
      return
    }
    if (normalizedCountryCode && !/^[A-Z]{2}$/.test(normalizedCountryCode)) {
      setError(t('employees.profile.countryInvalid'))
      return
    }
    if (!form.is_permanent && !form.fixed_term_end_date) {
      setError(t('employees.profile.fixedEndRequired'))
      return
    }
    if (form.compensation_type === 'hourly' && !form.hourly_wage.trim()) {
      setError(t('employees.profile.compensationRequired'))
      return
    }
    if (form.compensation_type === 'fixed' && !form.fixed_salary.trim()) {
      setError(t('employees.profile.compensationRequired'))
      return
    }

    setSaving(true)
    const payload = buildEmployeeProfilePayload(form, companyId)
    const query = employee
      ? supabase.from('employees').update(payload).eq('id', employee.id).eq('company_id', companyId).select('id').single()
      : supabase.from('employees').insert(payload).select('id').single()
    const { data, error: saveError } = await query
    setSaving(false)

    if (saveError || !data) {
      setError(saveError?.code === '42703' || saveError?.code === 'PGRST204'
        ? t('employees.profile.migrationRequired')
        : t('employees.profile.saveFailed'))
      return
    }

    router.push(`/app/employees/${data.id}`)
    router.refresh()
  }

  const section = (title: string, children: React.ReactNode) => (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  )

  const field = (key: keyof FormState, label: string, options?: { type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; required?: boolean }) => (
    <label className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={options?.type ?? 'text'}
        inputMode={options?.inputMode}
        required={options?.required}
        value={String(form[key])}
        onChange={(event) => update(key, event.target.value as never)}
        className={inputClass}
      />
    </label>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {section(t('employees.profile.personal'), <>
        {field('first_name', t('employees.profile.firstName'), { required: true })}
        {field('last_name', t('employees.profile.lastName'), { required: true })}
        {field('birth_date', t('employees.profile.birthDate'), { type: 'date' })}
        {field('birth_place', t('employees.profile.birthPlace'))}
        {field('birth_country', t('employees.profile.birthCountry'))}
        {field('nationality', t('employees.profile.nationality'))}
      </>)}

      {section(t('employees.profile.contact'), <>
        {field('email', t('employees.email'), { type: 'email' })}
        {field('phone', t('employees.phone'), { type: 'tel' })}
      </>)}

      {section(t('employees.profile.address'), <>
        {field('street', t('employees.profile.street'))}
        {field('house_number', t('employees.profile.houseNumber'))}
        {field('postal_code', t('employees.profile.postalCode'), { inputMode: 'text' })}
        {field('city', t('employees.profile.city'))}
        <label className="space-y-1">
          <span className="text-sm font-medium">{t('employees.profile.country')}</span>
          <input
            list="employee-country-codes"
            value={form.country_code}
            maxLength={2}
            autoComplete="off"
            onChange={(event) => update('country_code', event.target.value.toUpperCase())}
            className={inputClass}
            placeholder="DE"
          />
          <datalist id="employee-country-codes">
            {suggestedCountryCodes.map((code) => <option key={code} value={code}>{countryDisplayNames?.of(code) ?? code}</option>)}
          </datalist>
          <span className="block text-xs leading-5 text-slate-500">{t('employees.profile.countryHint')}</span>
        </label>
      </>)}

      {section(t('employees.profile.employment'), <>
        {field('job_title', t('employees.jobTitle'), { required: true })}
        {field('employment_start_date', t('employees.profile.startDate'), { type: 'date' })}
        <label className="space-y-1">
          <span className="text-sm font-medium">{t('employees.employmentType')}</span>
          <AppSelect value={form.employment_type} onChange={(value) => update('employment_type', value as EmploymentType)} options={visibleEmploymentTypes.map((value) => ({ value, label: t(`employees.type.${value}`) }))} />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">{t('employees.status')}</span>
          <AppSelect value={form.status} onChange={(value) => update('status', value as EmployeeStatus)} options={employeeStatuses.map((value) => ({ value, label: t(`employees.status.${value}`) }))} />
        </label>
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">{t('employees.profile.term')}</legend>
          <label className="mr-5 inline-flex min-h-11 items-center gap-2"><input type="radio" checked={form.is_permanent} onChange={() => update('is_permanent', true)} />{t('employees.profile.permanent')}</label>
          <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" checked={!form.is_permanent} onChange={() => update('is_permanent', false)} />{t('employees.profile.fixedTerm')}</label>
        </fieldset>
        {!form.is_permanent && field('fixed_term_end_date', t('employees.profile.fixedUntil'), { type: 'date', required: true })}
      </>)}

      {section(t('employees.profile.compensation'), <>
        {field('hours_per_week', t('employees.profile.hoursPerWeek'), { inputMode: 'decimal' })}
        {field('annual_vacation_days', t('employees.profile.annualVacation'), { inputMode: 'decimal' })}
        <label className="space-y-1">
          <span className="text-sm font-medium">{t('employees.profile.compensationType')}</span>
          <AppSelect value={form.compensation_type} onChange={(value) => update('compensation_type', value as CompensationType | '')} options={[{ value: '', label: t('employees.profile.noCompensation') }, ...compensationTypes.map((value) => ({ value, label: t(`employees.profile.compensation.${value}`) }))]} />
        </label>
        {form.compensation_type && (
          <label className="space-y-1">
            <span className="text-sm font-medium">{t('common.currency')}</span>
            <AppSelect value={form.compensation_currency} onChange={(value) => update('compensation_currency', value)} options={currencyOptions.map((item) => ({ value: item.code, label: `${item.code} — ${item.label}` }))} />
          </label>
        )}
        {form.compensation_type === 'hourly' && field('hourly_wage', t('employees.profile.hourlyWage'), { inputMode: 'decimal', required: true })}
        {form.compensation_type === 'fixed' && field('fixed_salary', t('employees.profile.fixedSalary'), { inputMode: 'decimal', required: true })}
      </>)}

      {section(t('employees.profile.countrySpecific'), showGermanyExtension ? <>
        <p className="text-sm leading-6 text-slate-600 sm:col-span-2">{t('employees.profile.germanyExtension')}</p>
        {field('tax_id', t('employees.profile.taxId'))}
        {field('tax_class', t('employees.profile.taxClass'))}
        {field('social_security_number', t('employees.profile.socialSecurityNumber'))}
        {field('health_insurance_provider', t('employees.profile.healthInsurance'))}
        {form.employment_type === 'minijob' && (
          <div className="space-y-2 sm:col-span-2">
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.minijob_flat_tax_2_percent} onChange={(event) => update('minijob_flat_tax_2_percent', event.target.checked)} />{t('employees.profile.minijobFlatTax')}</label>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.pension_insurance_exemption} onChange={(event) => update('pension_insurance_exemption', event.target.checked)} />{t('employees.profile.pensionExemption')}</label>
          </div>
        )}
        <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{t('employees.profile.sensitiveNotice')}</p>
      </> : <p className="text-sm leading-6 text-slate-600 sm:col-span-2">
        {normalizedCountryCode ? t('employees.profile.noCountryFields') : t('employees.profile.selectCountry')}
      </p>)}

      {section(t('employees.profile.documents'), <p className="text-sm leading-6 text-slate-600 sm:col-span-2">{t('employees.profile.documentsNotice')}</p>)}

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <label className="block space-y-1"><span className="text-sm font-medium">{t('employees.notes')}</span><textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} className={`${inputClass} min-h-28`} /></label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
