'use client'

import { useEffect, useRef, useState } from 'react'
import { AddressAutocomplete } from '@/components/address-autocomplete'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { type AppMode } from '@/lib/app-mode'
import { loadCompanyBranding, saveCompanyBranding } from '@/lib/company-branding'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'

export function WorkspaceSettingsPanel() {
  const { currentCompany, refreshCompanies } = useCompany()
  const { t } = useI18n()
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<AppMode>('personal')
  const [currency, setCurrency] = useState('USD')
  const [logo, setLogo] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!currentCompany) return
    const branding = loadCompanyBranding(currentCompany.id)
    setName(currentCompany.name)
    setMode(currentCompany.type)
    setCurrency(normalizeCurrencyCode(currentCompany.currency ?? 'USD'))
    setLogo(branding.logo)
    setAddress(branding.address)
    setEmail(branding.email)
    setIban(branding.iban)
    setBic(branding.bic)
    setTaxNumber(branding.taxNumber)
    setMessage('')
    setError(false)
  }, [currentCompany])

  const persistBranding = (overrides: Partial<ReturnType<typeof loadCompanyBranding>> = {}) => {
    if (!currentCompany) return
    saveCompanyBranding(currentCompany.id, {
      logo,
      address,
      email,
      iban,
      bic,
      taxNumber,
      ...overrides,
    })
  }

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(true)
      setMessage(t('settings.saveFailed'))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const nextLogo = typeof reader.result === 'string' ? reader.result : ''
      setLogo(nextLogo)
      persistBranding({ logo: nextLogo })
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany || !name.trim()) return

    setSaving(true)
    setMessage('')
    setError(false)
    try {
      const modeChanged = mode !== currentCompany.type
      const response = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: currentCompany.id,
          name: name.trim(),
          type: mode,
          currency,
        }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'workspace_update_failed')

      persistBranding()
      await refreshCompanies(currentCompany.id)
      setMessage(modeChanged ? t('settings.modeSaved') : t('settings.workspaceSaved'))
    } catch {
      setError(true)
      setMessage(t('settings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!currentCompany) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.workspaceTitle')}</CardTitle>
          <CardDescription>{t('settings.workspaceDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{t('settings.noWorkspace')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSave}>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.workspaceTitle')}</CardTitle>
          <CardDescription>{t('settings.workspaceDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {message && (
            <p className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
              {message}
            </p>
          )}

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-950">{t('settings.modeTitle')}</legend>
            <p className="text-sm text-slate-600">{t('settings.modeDescription')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['personal', 'business'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`rounded-md border p-4 text-left transition ${mode === value ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="block font-semibold text-slate-950">{t(`settings.${value}Mode`)}</span>
                  <span className="mt-1 block text-sm text-slate-600">{t(`settings.${value}ModeDescription`)}</span>
                </button>
              ))}
            </div>
            <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">{t('settings.modeVisibilityNotice')}</p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">{t('profile.workspaceName')}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">{t('profile.workspaceCurrency')}</span>
              <AppSelect
                value={currency}
                onChange={(value) => setCurrency(normalizeCurrencyCode(value))}
                options={currencyOptions.map((option) => ({ value: option.code, label: `${option.code} - ${option.label}` }))}
              />
            </label>
          </div>

          {mode === 'business' && (
            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div className="flex flex-wrap items-center gap-4">
                {logo ? (
                  <img src={logo} alt={name} className="h-14 w-14 rounded-md object-contain" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-500">{name.slice(0, 1).toUpperCase()}</div>
                )}
                <div>
                  <span className="block text-sm font-medium">{t('profile.companyLogo')}</span>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => logoInputRef.current?.click()}>{t('common.chooseFile')}</Button>
                </div>
                {logo && <Button type="button" variant="outline" size="sm" onClick={() => { setLogo(''); persistBranding({ logo: '' }) }}>{t('common.delete')}</Button>}
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('profile.companyAddress')}</span>
                <AddressAutocomplete
                  onSelect={(suggestion) => {
                    const nextAddress = [
                      [suggestion.street, suggestion.houseNumber].filter(Boolean).join(' '),
                      [suggestion.postalCode, suggestion.city].filter(Boolean).join(' '),
                      suggestion.state,
                      suggestion.country,
                    ].filter(Boolean).join('\n')
                    setAddress(nextAddress)
                  }}
                />
                <textarea value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={t('profile.companyAddressPlaceholder')} />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1"><span className="text-sm font-medium">{t('profile.companyEmail')}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('profile.companyIban')}</span><input value={iban} onChange={(event) => setIban(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('profile.companyBic')}</span><input value={bic} onChange={(event) => setBic(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('profile.companyTaxNumber')}</span><input value={taxNumber} onChange={(event) => setTaxNumber(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              </div>
            </div>
          )}

          <Button type="submit" disabled={saving}>{saving ? t('common.loading') : t('common.saveChanges')}</Button>
        </CardContent>
      </Card>
    </form>
  )
}
