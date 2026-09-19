'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, FilePlus2, Trash2, Upload } from 'lucide-react'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/i18n-context'
import { getEmployeeDocumentStatus, type EmployeeDocumentRequirement, type EmployeeDocumentRow } from '@/lib/employee-documents'

interface Props { companyId: string; employeeId: string; countryCode: string | null; jobTitle: string }
interface DocumentItem { type: string; label: string; requirementId?: string; required?: boolean; countryCode?: string | null; jobRole?: string | null }

const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm'

export function EmployeeDocumentManager({ companyId, employeeId, countryCode, jobTitle }: Props) {
  const { t } = useI18n()
  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([])
  const [requirements, setRequirements] = useState<EmployeeDocumentRequirement[]>([])
  const [hasDrivingLicence, setHasDrivingLicence] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingType, setEditingType] = useState<string | null>(null)
  const [requirementOpen, setRequirementOpen] = useState(false)
  const [requirement, setRequirement] = useState({ preset: 'custom', name: '', countryCode: '', jobRole: '', isRequired: false })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const response = await fetch(`/api/employees/${employeeId}/documents?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setError(t(data.error === 'migration_required' ? 'employees.documents.migrationRequired' : 'employees.documents.loadFailed'))
    else { setDocuments(data.documents ?? []); setRequirements(data.requirements ?? []); setHasDrivingLicence(data.hasDrivingLicence ?? null) }
    setLoading(false)
  }, [companyId, employeeId, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  const common = useMemo<DocumentItem[]>(() => [
    { type:'common:employment_contract', label:t('employees.documents.contract') },
    { type:'common:identity', label:t('employees.documents.identity') },
    { type:'common:work_authorization', label:t('employees.documents.workAuthorization') },
    { type:'common:profile_photo', label:t('employees.documents.profilePhoto') },
    { type:'common:other', label:t('employees.documents.other') },
  ], [t])
  const german = useMemo<DocumentItem[]>(() => countryCode === 'DE' ? [
    { type:'de:health_insurance_proof', label:t('employees.documents.healthProof') },
    { type:'de:pension_exemption', label:t('employees.documents.pensionProof') },
    { type:'de:student_enrollment', label:t('employees.documents.studentProof') },
  ] : [], [countryCode, t])
  const custom = requirements.map((item) => ({ type:item.document_type, label:item.name, requirementId:item.id, required:item.is_required, countryCode:item.country_code, jobRole:item.job_role }))
  const byType = new Map(documents.map((item) => [item.document_type, item]))

  const errorText = (code?: string) => t(code === 'migration_required' ? 'employees.documents.migrationRequired' : 'employees.documents.saveFailed')
  async function uploadDocument(event: React.FormEvent<HTMLFormElement>, item: DocumentItem) {
    event.preventDefault(); if (busy) return
    const form = new FormData(event.currentTarget)
    const issue = String(form.get('issueDate') ?? ''), expiration = String(form.get('expirationDate') ?? '')
    if (issue && expiration && expiration < issue) { setError(t('employees.documents.datesInvalid')); return }
    form.set('companyId', companyId); form.set('documentType', item.type); form.set('displayName', item.label)
    if (item.requirementId) form.set('requirementId', item.requirementId)
    setBusy(true); setError(''); setMessage('')
    const response = await fetch(`/api/employees/${employeeId}/documents`, { method:'POST', body:form })
    const data = await response.json().catch(() => ({})); setBusy(false)
    if (!response.ok) { setError(errorText(data.error)); return }
    setEditingType(null); setMessage(t('employees.documents.saved')); await load()
  }
  async function openDocument(document: EmployeeDocumentRow, download: boolean) {
    const response = await fetch(`/api/employees/${employeeId}/documents/${document.id}?companyId=${encodeURIComponent(companyId)}&download=${download ? '1':'0'}`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.url) { setError(t('employees.documents.loadFailed')); return }
    window.open(data.url, '_blank', 'noopener,noreferrer')
  }
  async function deleteDocument(document: EmployeeDocumentRow) {
    if (!window.confirm(t('employees.documents.confirmDelete'))) return
    setBusy(true)
    const response = await fetch(`/api/employees/${employeeId}/documents/${document.id}?companyId=${encodeURIComponent(companyId)}`, { method:'DELETE' })
    setBusy(false); if (!response.ok) { setError(t('employees.documents.deleteFailed')); return }; await load()
  }
  async function createRequirement(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    const presetNames: Record<string,string> = { id_front:t('employees.documents.idFront'), id_back:t('employees.documents.idBack'), pass_photo:t('employees.documents.profilePhoto'), brw_id:t('employees.documents.brwId'), certificate:t('employees.documents.certificate'), driving_licence:t('employees.documents.drivingLicence') }
    const name = requirement.preset === 'custom' ? requirement.name.trim() : presetNames[requirement.preset]
    if (!name) return
    setBusy(true); setError('')
    const response = await fetch(`/api/employees/${employeeId}/document-requirements`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ companyId, name, countryCode:requirement.countryCode.trim().toUpperCase() || null, jobRole:requirement.jobRole.trim() || null, isRequired:requirement.isRequired }) })
    const data = await response.json().catch(() => ({})); setBusy(false)
    if (!response.ok) { setError(errorText(data.error)); return }
    setRequirement({ preset:'custom', name:'', countryCode:'', jobRole:'', isRequired:false }); setRequirementOpen(false); await load()
  }
  async function deleteRequirement(item: DocumentItem) {
    if (!item.requirementId || !window.confirm(t('employees.documents.confirmRequirementDelete'))) return
    setBusy(true)
    const response = await fetch(`/api/employees/${employeeId}/document-requirements`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ companyId, requirementId:item.requirementId }) })
    setBusy(false); if (!response.ok) { setError(t('employees.documents.deleteFailed')); return }; await load()
  }
  async function saveLicence(value: boolean | null) {
    setHasDrivingLicence(value)
    const response = await fetch(`/api/employees/${employeeId}/document-settings`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ companyId, hasDrivingLicence:value }) })
    if (!response.ok) setError(t('employees.documents.saveFailed'))
  }

  const statusLabel = (document?: EmployeeDocumentRow) => t(`employees.documents.${({ missing:'missing', uploaded:'uploaded', expiring_soon:'expiringSoon', expired:'expired' } as const)[getEmployeeDocumentStatus(document)]}`)
  const group = (title: string, items: DocumentItem[]) => <section className="space-y-3"><h4 className="font-semibold text-slate-900">{title}</h4><div className="grid gap-3 xl:grid-cols-2">{items.map((item) => {
    const document = byType.get(item.type); const status = getEmployeeDocumentStatus(document)
    return <div key={item.type} className="rounded-md border border-slate-200 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{item.label}</p><p className={`text-xs ${status === 'expired' ? 'text-red-700' : status === 'expiring_soon' ? 'text-amber-700' : 'text-slate-500'}`}>{statusLabel(document)}{item.required ? ` · ${t('employees.documents.requiredBadge')}` : ''}</p>{(item.countryCode || item.jobRole) && <p className="mt-1 text-xs text-slate-500">{[item.countryCode, item.jobRole].filter(Boolean).join(' · ')}</p>}</div><div className="flex flex-wrap gap-1">{document && <><Button size="sm" variant="outline" onClick={() => void openDocument(document,false)}><Eye />{t('employees.documents.view')}</Button><Button size="sm" variant="outline" onClick={() => void openDocument(document,true)}><Download />{t('employees.documents.download')}</Button></>}<Button size="sm" variant="outline" onClick={() => setEditingType(editingType === item.type ? null : item.type)}><Upload />{document ? t('employees.documents.replace') : t('employees.documents.upload')}</Button>{document && <Button aria-label={t('employees.documents.remove')} size="icon" variant="ghost" disabled={busy} onClick={() => void deleteDocument(document)}><Trash2 /></Button>}{item.requirementId && !document && <Button aria-label={t('employees.documents.removeRequirement')} size="icon" variant="ghost" disabled={busy} onClick={() => void deleteRequirement(item)}><Trash2 /></Button>}</div></div>{document && <p className="mt-2 break-all text-xs text-slate-500">{document.original_filename}{document.expiration_date ? ` · ${t('employees.documents.expirationDate')}: ${document.expiration_date}` : ''}</p>}{editingType === item.type && <form onSubmit={(event) => void uploadDocument(event,item)} className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2"><label className="space-y-1 sm:col-span-2"><span className="text-sm">{t('employees.documents.file')}</span><input required name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className={inputClass} /></label><label className="space-y-1"><span className="text-sm">{t('employees.documents.issueDate')}</span><input name="issueDate" type="date" className={inputClass} /></label><label className="space-y-1"><span className="text-sm">{t('employees.documents.expirationDate')}</span><input name="expirationDate" type="date" className={inputClass} /></label><label className="space-y-1 sm:col-span-2"><span className="text-sm">{t('employees.documents.reference')}</span><input name="documentReference" className={inputClass} /></label><p className="text-xs text-slate-500 sm:col-span-2">{t('employees.documents.privateHint')}</p><div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{t('employees.documents.saveDocument')}</Button><Button type="button" variant="outline" onClick={() => setEditingType(null)}>{t('employees.documents.cancel')}</Button></div></form>}</div>
  })}</div></section>

  return <Card><CardHeader><CardTitle>{t('employees.documents.title')}</CardTitle><p className="text-sm text-slate-600">{t('employees.documents.intro')}</p></CardHeader><CardContent className="space-y-6">{error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}{loading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : <>{group(t('employees.documents.common'), common)}{countryCode === 'DE' ? group(t('employees.documents.germany'), german) : <p className="text-sm text-slate-500">{t('employees.documents.notApplicable')}</p>}<section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">{t('employees.documents.custom')}</h4><Button variant="outline" onClick={() => setRequirementOpen(!requirementOpen)}><FilePlus2 />{t('employees.documents.addRequirement')}</Button></div><label className="flex flex-col gap-1 sm:max-w-sm"><span className="text-sm font-medium">{t('employees.documents.hasDrivingLicence')}</span><AppSelect value={hasDrivingLicence === null ? 'unknown' : hasDrivingLicence ? 'yes':'no'} onChange={(value) => void saveLicence(value === 'unknown' ? null : value === 'yes')} options={[{value:'unknown',label:t('employees.documents.unknown')},{value:'yes',label:t('employees.profile.yes')},{value:'no',label:t('employees.profile.no')}]} /></label>{requirementOpen && <form onSubmit={(event) => void createRequirement(event)} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-sm">{t('employees.documents.preset')}</span><AppSelect value={requirement.preset} onChange={(preset) => setRequirement((v)=>({...v,preset}))} options={['custom','id_front','id_back','pass_photo','brw_id','certificate','driving_licence'].map((value)=>({value,label:t(`employees.documents.${({custom:'customName',id_front:'idFront',id_back:'idBack',pass_photo:'profilePhoto',brw_id:'brwId',certificate:'certificate',driving_licence:'drivingLicence'} as Record<string,string>)[value]}`)}))} /></label>{requirement.preset === 'custom' && <label className="space-y-1"><span className="text-sm">{t('employees.documents.requirementName')}</span><input required value={requirement.name} onChange={(e)=>setRequirement((v)=>({...v,name:e.target.value}))} className={inputClass}/></label>}<label className="space-y-1"><span className="text-sm">{t('employees.documents.countryOptional')}</span><input maxLength={2} value={requirement.countryCode} onChange={(e)=>setRequirement((v)=>({...v,countryCode:e.target.value.toUpperCase()}))} className={inputClass}/></label><label className="space-y-1"><span className="text-sm">{t('employees.documents.jobOptional')}</span><input value={requirement.jobRole} placeholder={jobTitle} onChange={(e)=>setRequirement((v)=>({...v,jobRole:e.target.value}))} className={inputClass}/></label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={requirement.isRequired} onChange={(e)=>setRequirement((v)=>({...v,isRequired:e.target.checked}))}/>{t('employees.documents.required')}</label><div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{t('employees.documents.createRequirement')}</Button><Button type="button" variant="outline" onClick={()=>setRequirementOpen(false)}>{t('employees.documents.cancel')}</Button></div></form>}{custom.length ? group(t('employees.documents.custom'),custom) : <p className="text-sm text-slate-500">{t('employees.documents.noCustom')}</p>}</section></>}</CardContent></Card>
}
