'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/i18n-context'
import {
  createDefaultEmployeeNumberSettings,
  formatEmployeeNumberPreview,
  isEmployeeNumberSchemaUnavailable,
  type EmployeeNumberSettings,
} from '@/lib/employee-number'
import { createClient } from '@/lib/supabase-client'

const inputClass = 'w-full min-w-0 max-w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm'

export function EmployeeNumberSettingsCard({ companyId }: { companyId: string }) {
  const { t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [settings, setSettings] = useState(() => createDefaultEmployeeNumberSettings(companyId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [schemaAvailable, setSchemaAvailable] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const result = await supabase
      .from('employee_number_settings')
      .select('company_id, require_employee_number, automatic_numbering, number_prefix, next_number, minimum_digits')
      .eq('company_id', companyId)
      .maybeSingle()

    if (result.error) {
      const unavailable = isEmployeeNumberSchemaUnavailable(result.error)
      setSchemaAvailable(!unavailable)
      setError(true)
      setMessage(unavailable ? t('employeeNumber.migrationRequired') : t('employeeNumber.loadFailed'))
    } else {
      setSchemaAvailable(true)
      setSettings(result.data
        ? { ...result.data, next_number: Number(result.data.next_number), minimum_digits: Number(result.data.minimum_digits) } as EmployeeNumberSettings
        : createDefaultEmployeeNumberSettings(companyId))
    }
    setLoading(false)
  }, [companyId, supabase, t])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || !schemaAvailable) return
    if (settings.number_prefix.trim().length > 32 || settings.next_number < 1 || settings.minimum_digits < 1 || settings.minimum_digits > 12) {
      setError(true)
      setMessage(t('employeeNumber.invalidSettings'))
      return
    }

    setSaving(true)
    setMessage('')
    setError(false)
    const result = await supabase.from('employee_number_settings').upsert({
      company_id: companyId,
      require_employee_number: settings.require_employee_number,
      automatic_numbering: settings.automatic_numbering,
      number_prefix: settings.number_prefix.trim(),
      next_number: Math.trunc(settings.next_number),
      minimum_digits: Math.trunc(settings.minimum_digits),
    }, { onConflict: 'company_id' })
    setSaving(false)

    if (result.error) {
      setError(true)
      setMessage(result.error.code === '23514'
        ? t('employeeNumber.counterDecrease')
        : isEmployeeNumberSchemaUnavailable(result.error)
          ? t('employeeNumber.migrationRequired')
          : t('employeeNumber.saveFailed'))
      return
    }
    setMessage(t('employeeNumber.saved'))
    await load()
  }

  const toggle = (key: 'require_employee_number' | 'automatic_numbering') => (
    <label className="flex min-w-0 items-start gap-3 rounded-md border border-slate-200 p-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0"
        checked={settings[key]}
        disabled={loading || !schemaAvailable}
        onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))}
      />
      <span className="min-w-0">
        <span className="block break-words text-sm font-medium">{t(`employeeNumber.${key === 'require_employee_number' ? 'require' : 'automatic'}`)}</span>
        <span className="mt-1 block break-words text-sm text-slate-600">{t(`employeeNumber.${key === 'require_employee_number' ? 'requireDescription' : 'automaticDescription'}`)}</span>
      </span>
    </label>
  )

  return (
    <form onSubmit={save} className="min-w-0 max-w-full">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t('employeeNumber.title')}</CardTitle>
          <CardDescription>{t('employeeNumber.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && <p className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{message}</p>}
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {toggle('require_employee_number')}
            {toggle('automatic_numbering')}
          </div>
          {settings.automatic_numbering && schemaAvailable && (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="min-w-0 space-y-1"><span className="text-sm font-medium">{t('employeeNumber.prefix')}</span><input className={inputClass} maxLength={32} value={settings.number_prefix} onChange={(event) => setSettings((current) => ({ ...current, number_prefix: event.target.value }))} /></label>
              <label className="min-w-0 space-y-1"><span className="text-sm font-medium">{t('employeeNumber.next')}</span><input className={inputClass} type="number" min={1} step={1} value={settings.next_number} onChange={(event) => setSettings((current) => ({ ...current, next_number: Number(event.target.value) }))} /></label>
              <label className="min-w-0 space-y-1"><span className="text-sm font-medium">{t('employeeNumber.minimumDigits')}</span><input className={inputClass} type="number" min={1} max={12} step={1} value={settings.minimum_digits} onChange={(event) => setSettings((current) => ({ ...current, minimum_digits: Number(event.target.value) }))} /></label>
              <p className="break-words rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900 sm:col-span-3">{t('employeeNumber.preview').replace('{number}', formatEmployeeNumberPreview(settings.number_prefix, settings.next_number, settings.minimum_digits))}</p>
            </div>
          )}
          <div className="flex justify-end"><Button type="submit" disabled={loading || saving || !schemaAvailable}>{saving ? t('common.loading') : t('common.save')}</Button></div>
        </CardContent>
      </Card>
    </form>
  )
}
