'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Save } from 'lucide-react'
import { CountrySelector } from '@/components/country-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCountryValue } from '@/lib/countries'

type LegalSettings = {
  legal_name: string
  legal_representative: string
  legal_street: string
  legal_house_number: string
  legal_postal_code: string
  legal_city: string
  legal_country_code: string
  legal_email: string
  legal_phone: string
  vat_id: string
  commercial_register: string
  register_court: string
  registration_number: string
  professional_regulatory_info: string
  additional_legal_text: string
}

const emptyLegalSettings: LegalSettings = {
  legal_name: '', legal_representative: '', legal_street: '', legal_house_number: '',
  legal_postal_code: '', legal_city: '', legal_country_code: '', legal_email: '',
  legal_phone: '', vat_id: '', commercial_register: '', register_court: '',
  registration_number: '', professional_regulatory_info: '', additional_legal_text: '',
}

const inputClass = 'w-full min-w-0 max-w-full rounded-md border border-slate-300 px-3 py-2.5 text-base sm:text-sm'

function normalizeLegalSettings(value: Partial<Record<keyof LegalSettings, string | null>> | null | undefined): LegalSettings {
  return Object.fromEntries(
    Object.keys(emptyLegalSettings).map((key) => [key, value?.[key as keyof LegalSettings] ?? '']),
  ) as LegalSettings
}

export function WorkspaceLegalSettings() {
  const { currentCompany } = useCompany()
  const { locale, t } = useI18n()
  const [form, setForm] = useState<LegalSettings>(emptyLegalSettings)
  const [saved, setSaved] = useState<LegalSettings>(emptyLegalSettings)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    const companyId = currentCompany?.id
    if (!companyId) {
      setForm(emptyLegalSettings)
      setSaved(emptyLegalSettings)
      setMessage('')
      setPreviewOpen(false)
      return
    }

    const controller = new AbortController()
    setForm(emptyLegalSettings)
    setSaved(emptyLegalSettings)
    setPreviewOpen(false)
    setLoading(true)
    setMessage('')
    setError(false)

    void fetch(`/api/workspaces/legal?companyId=${encodeURIComponent(companyId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { legal?: Partial<Record<keyof LegalSettings, string | null>> }
        if (!response.ok || !payload.legal) throw new Error('legal_load_failed')
        const next = normalizeLegalSettings(payload.legal)
        setForm(next)
        setSaved(next)
      })
      .catch((loadError) => {
        if (loadError instanceof Error && loadError.name === 'AbortError') return
        setError(true)
        setMessage(t('workspaceLegal.loadFailed'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [currentCompany?.id, t])

  const update = (field: keyof LegalSettings, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setMessage('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return

    setSaving(true)
    setMessage('')
    setError(false)
    try {
      const response = await fetch('/api/workspaces/legal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, ...form }),
      })
      const payload = await response.json().catch(() => ({})) as { legal?: Partial<Record<keyof LegalSettings, string | null>> }
      if (!response.ok || !payload.legal) throw new Error('legal_save_failed')
      const next = normalizeLegalSettings(payload.legal)
      setForm(next)
      setSaved(next)
      setMessage(t('workspaceLegal.saved'))
    } catch {
      setError(true)
      setMessage(t('workspaceLegal.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const previewHasContent = useMemo(
    () => Object.values(saved).some((value) => value.trim()),
    [saved],
  )
  const addressLines = [
    [saved.legal_street, saved.legal_house_number].filter(Boolean).join(' '),
    [saved.legal_postal_code, saved.legal_city].filter(Boolean).join(' '),
    formatCountryValue(saved.legal_country_code, locale),
  ].filter(Boolean)
  const registerRows = [
    ['workspaceLegal.commercialRegister', saved.commercial_register],
    ['workspaceLegal.registerCourt', saved.register_court],
    ['workspaceLegal.registrationNumber', saved.registration_number],
    ['workspaceLegal.vatId', saved.vat_id],
  ].filter(([, value]) => value)

  const field = (name: keyof LegalSettings, label: string, options: { type?: string; autoComplete?: string } = {}) => (
    <label className="min-w-0 space-y-1">
      <span className="block break-words text-sm font-medium text-slate-800">{label}</span>
      <input
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete}
        value={form[name]}
        onChange={(event) => update(name, event.target.value)}
        className={inputClass}
      />
    </label>
  )

  if (!currentCompany) {
    return <Card><CardContent className="pt-6"><p className="text-sm text-slate-600">{t('workspaceLegal.noWorkspace')}</p></CardContent></Card>
  }

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t('workspaceLegal.formTitle')}</CardTitle>
          <CardDescription>{t('workspaceLegal.formDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-600">{t('workspaceLegal.loading')}</p>
          ) : (
            <form onSubmit={handleSubmit} className="min-w-0 space-y-6">
              <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-950">{t('workspaceLegal.workspaceNotice')}</p>
              {message && (
                <p role={error ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
                  {message}
                </p>
              )}

              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                {field('legal_name', t('workspaceLegal.legalName'), { autoComplete: 'organization' })}
                {field('legal_representative', t('workspaceLegal.representative'))}
                {field('legal_street', t('workspaceLegal.street'), { autoComplete: 'address-line1' })}
                {field('legal_house_number', t('workspaceLegal.houseNumber'), { autoComplete: 'address-line2' })}
                {field('legal_postal_code', t('workspaceLegal.postalCode'), { autoComplete: 'postal-code' })}
                {field('legal_city', t('workspaceLegal.city'), { autoComplete: 'address-level2' })}
                <CountrySelector
                  label={t('workspaceLegal.country')}
                  value={form.legal_country_code}
                  onChange={(value) => update('legal_country_code', value)}
                />
                {field('legal_email', t('workspaceLegal.email'), { type: 'email', autoComplete: 'email' })}
                {field('legal_phone', t('workspaceLegal.phone'), { type: 'tel', autoComplete: 'tel' })}
                {field('vat_id', t('workspaceLegal.vatId'))}
                {field('commercial_register', t('workspaceLegal.commercialRegister'))}
                {field('register_court', t('workspaceLegal.registerCourt'))}
                {field('registration_number', t('workspaceLegal.registrationNumber'))}
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-4">
                <label className="min-w-0 space-y-1">
                  <span className="block break-words text-sm font-medium text-slate-800">{t('workspaceLegal.regulatoryInformation')}</span>
                  <textarea value={form.professional_regulatory_info} onChange={(event) => update('professional_regulatory_info', event.target.value)} className={`${inputClass} min-h-28 resize-y`} />
                </label>
                <label className="min-w-0 space-y-1">
                  <span className="block break-words text-sm font-medium text-slate-800">{t('workspaceLegal.additionalLegalText')}</span>
                  <textarea value={form.additional_legal_text} onChange={(event) => update('additional_legal_text', event.target.value)} className={`${inputClass} min-h-32 resize-y`} />
                </label>
              </div>

              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  <Save className="h-4 w-4" />{saving ? t('common.loading') : t('workspaceLegal.save')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setPreviewOpen((open) => !open)} className="w-full sm:w-auto" aria-expanded={previewOpen}>
                  {previewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {previewOpen ? t('workspaceLegal.hidePreview') : t('workspaceLegal.preview')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {previewOpen && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{t('workspaceLegal.previewTitle')}</CardTitle>
            <CardDescription>{t('workspaceLegal.previewDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!previewHasContent ? (
              <p className="text-sm text-slate-600">{t('workspaceLegal.emptyPreview')}</p>
            ) : (
              <article className="min-w-0 space-y-5 break-words text-sm leading-6 text-slate-800">
                {(saved.legal_name || saved.legal_representative) && <section>
                  {saved.legal_name && <h2 className="text-lg font-semibold text-slate-950">{saved.legal_name}</h2>}
                  {saved.legal_representative && <p><span className="font-medium">{t('workspaceLegal.representative')}:</span> {saved.legal_representative}</p>}
                </section>}
                {addressLines.length > 0 && <section><h3 className="font-semibold text-slate-950">{t('workspaceLegal.address')}</h3>{addressLines.map((line) => <p key={line}>{line}</p>)}</section>}
                {(saved.legal_email || saved.legal_phone) && <section><h3 className="font-semibold text-slate-950">{t('workspaceLegal.contact')}</h3>{saved.legal_email && <p><span className="font-medium">{t('workspaceLegal.email')}:</span> {saved.legal_email}</p>}{saved.legal_phone && <p><span className="font-medium">{t('workspaceLegal.phone')}:</span> {saved.legal_phone}</p>}</section>}
                {registerRows.length > 0 && <section><h3 className="font-semibold text-slate-950">{t('workspaceLegal.registerInformation')}</h3>{registerRows.map(([label, value]) => <p key={label}><span className="font-medium">{t(label)}:</span> {value}</p>)}</section>}
                {saved.professional_regulatory_info && <section><h3 className="font-semibold text-slate-950">{t('workspaceLegal.regulatoryInformation')}</h3><p className="whitespace-pre-wrap">{saved.professional_regulatory_info}</p></section>}
                {saved.additional_legal_text && <section><h3 className="font-semibold text-slate-950">{t('workspaceLegal.additionalLegalText')}</h3><p className="whitespace-pre-wrap">{saved.additional_legal_text}</p></section>}
              </article>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
