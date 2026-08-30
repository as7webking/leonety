'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Archive,
  Copy,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'
import {
  contractLanguages,
  contractStatuses,
  contractTemplates,
  createContractReference,
  createEmptyDocument,
  emptyContractTerms,
  emptyPartySnapshot,
  getContractTemplate,
  getLanguageName,
  isContractLanguage,
  isContractStatus,
  type ContractClause,
  type ContractLanguage,
  type ContractPartySnapshot,
  type ContractStatus,
  type ContractTemplateId,
  type ContractTerms,
  type GeneratedContractDocument,
} from '@/lib/contracts'

interface ClientOption {
  id: string
  name: string
  email: string | null
  phone: string | null
  client_company: string | null
  street?: string | null
  house_number?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string | null
  tax_number?: string | null
}

interface ContractRow {
  id: string
  company_id: string
  client_id: string | null
  reference: string
  template_type: ContractTemplateId
  language: ContractLanguage
  title: string
  status: ContractStatus
  effective_date: string | null
  party_a_snapshot: ContractPartySnapshot
  party_b_snapshot: ContractPartySnapshot
  terms_snapshot: ContractTerms
  generated_document: GeneratedContractDocument
  created_by: string | null
  created_at: string
  updated_at: string
  finalized_at: string | null
}

type RewriteAction = 'professional' | 'shorter' | 'detailed' | 'simple' | 'provider' | 'client' | 'neutral'

const rewriteActions: RewriteAction[] = ['professional', 'shorter', 'detailed', 'simple', 'provider', 'client', 'neutral']

function normalizeDocument(value: unknown, fallbackTitle: string): GeneratedContractDocument {
  const record = value && typeof value === 'object' ? value as Partial<GeneratedContractDocument> : {}
  return {
    title: String(record.title ?? fallbackTitle),
    introduction: String(record.introduction ?? ''),
    clauses: Array.isArray(record.clauses)
      ? record.clauses.map((clause, index) => ({
          id: String(clause?.id ?? `clause-${index + 1}`),
          heading: String(clause?.heading ?? ''),
          body: String(clause?.body ?? ''),
        }))
      : [],
    closing: String(record.closing ?? ''),
  }
}

function normalizeParty(value: unknown): ContractPartySnapshot {
  const record = value && typeof value === 'object' ? value as Partial<ContractPartySnapshot> : {}
  return {
    ...emptyPartySnapshot,
    ...record,
  }
}

function normalizeTerms(value: unknown): ContractTerms {
  const record = value && typeof value === 'object' ? value as Partial<ContractTerms> : {}
  return {
    ...emptyContractTerms,
    ...record,
  }
}

function formatClientAddress(client: ClientOption) {
  return [
    [client.street, client.house_number].filter(Boolean).join(' '),
    [client.postal_code, client.city].filter(Boolean).join(' '),
    client.country,
  ].filter(Boolean).join(', ')
}

function createClause() {
  return {
    id: `clause-${Date.now()}`,
    heading: '',
    body: '',
  }
}

function parseContractRow(row: Record<string, unknown>): ContractRow {
  const title = String(row.title ?? '')
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    client_id: row.client_id ? String(row.client_id) : null,
    reference: String(row.reference ?? ''),
    template_type: contractTemplates.some((template) => template.id === row.template_type)
      ? row.template_type as ContractTemplateId
      : 'general_service',
    language: isContractLanguage(String(row.language)) ? String(row.language) as ContractLanguage : 'en',
    title,
    status: isContractStatus(String(row.status)) ? String(row.status) as ContractStatus : 'draft',
    effective_date: row.effective_date ? String(row.effective_date) : null,
    party_a_snapshot: normalizeParty(row.party_a_snapshot),
    party_b_snapshot: normalizeParty(row.party_b_snapshot),
    terms_snapshot: normalizeTerms(row.terms_snapshot),
    generated_document: normalizeDocument(row.generated_document, title),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    finalized_at: row.finalized_at ? String(row.finalized_at) : null,
  }
}

export default function ContractsPage() {
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const searchParams = useSearchParams()
  const [supabase] = useState(() => createClient())
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [rewritingClauseId, setRewritingClauseId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [clientId, setClientId] = useState('')
  const [templateId, setTemplateId] = useState<ContractTemplateId>('general_service')
  const [contractLanguage, setContractLanguage] = useState<ContractLanguage>(isContractLanguage(locale) ? locale : 'en')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<ContractStatus>('draft')
  const [partyA, setPartyA] = useState<ContractPartySnapshot>(emptyPartySnapshot)
  const [partyB, setPartyB] = useState<ContractPartySnapshot>(emptyPartySnapshot)
  const [terms, setTerms] = useState<ContractTerms>(emptyContractTerms)
  const [document, setDocument] = useState<GeneratedContractDocument>(createEmptyDocument())
  const editorRef = useRef<HTMLDivElement | null>(null)

  const template = getContractTemplate(templateId)

  const loadData = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const [contractResult, clientResult] = await Promise.all([
      supabase
        .from('contracts')
        .select('*')
        .eq('company_id', currentCompany.id)
        .neq('status', 'archived')
        .order('updated_at', { ascending: false }),
      supabase
        .from('clients')
        .select('id, name, email, phone, client_company, street, house_number, postal_code, city, country, tax_number')
        .eq('company_id', currentCompany.id)
        .order('name', { ascending: true }),
    ])

    if (contractResult.error) {
      setContracts([])
      setError(contractResult.error.code === '42P01' || contractResult.error.code === 'PGRST205'
        ? t('contracts.databaseRequired')
        : t('contracts.loadFailed'))
    } else {
      setContracts((contractResult.data ?? []).map((row) => parseContractRow(row as Record<string, unknown>)))
    }

    if (!clientResult.error) {
      setClients((clientResult.data ?? []) as ClientOption[])
    }

    setLoading(false)
  }, [currentCompany, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadData()
    })
    return () => { cancelled = true }
  }, [loadData])

  useEffect(() => {
    if (!currentCompany) return
    setPartyA((current) => ({
      ...current,
      name: current.name || currentCompany.name,
      company: current.company || currentCompany.name,
      country: current.country || '',
    }))
  }, [currentCompany])

  useEffect(() => {
    const preselectedClientId = searchParams.get('clientId')
    if (!preselectedClientId || clients.length === 0) return
    const client = clients.find((item) => item.id === preselectedClientId)
    if (!client) return
    startCreate()
    setClientId(client.id)
    fillPartyBFromClient(client)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.length])

  const filteredContracts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return contracts.filter((contract) => {
      const client = clients.find((item) => item.id === contract.client_id)
      const haystack = [
        contract.title,
        contract.reference,
        client?.name,
        client?.client_company,
        contract.party_b_snapshot.name,
        contract.party_b_snapshot.company,
      ].filter(Boolean).join(' ').toLowerCase()

      return (!normalizedSearch || haystack.includes(normalizedSearch)) &&
        (statusFilter === 'all' || contract.status === statusFilter) &&
        (languageFilter === 'all' || contract.language === languageFilter) &&
        (templateFilter === 'all' || contract.template_type === templateFilter) &&
        (clientFilter === 'all' || contract.client_id === clientFilter)
    })
  }, [clientFilter, clients, contracts, languageFilter, search, statusFilter, templateFilter])

  function resetEditor() {
    setEditingId(null)
    setClientId('')
    setTemplateId('general_service')
    setContractLanguage(isContractLanguage(locale) ? locale : 'en')
    setTitle('')
    setStatus('draft')
    setPartyA(currentCompany ? { ...emptyPartySnapshot, name: currentCompany.name, company: currentCompany.name } : emptyPartySnapshot)
    setPartyB(emptyPartySnapshot)
    setTerms({ ...emptyContractTerms, currency: currentCompany?.currency ?? 'EUR' })
    setDocument(createEmptyDocument())
  }

  function startCreate() {
    resetEditor()
    setMessage('')
    setError('')
    window.requestAnimationFrame(() => editorRef.current?.focus())
  }

  function fillPartyBFromClient(client: ClientOption) {
    setPartyB({
      name: client.name,
      company: client.client_company ?? '',
      address: formatClientAddress(client),
      email: client.email ?? '',
      phone: client.phone ?? '',
      taxId: client.tax_number ?? '',
      representative: '',
      country: client.country ?? '',
    })
  }

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId)
    const client = clients.find((item) => item.id === nextClientId)
    if (client) fillPartyBFromClient(client)
  }

  function editContract(contract: ContractRow) {
    setEditingId(contract.id)
    setClientId(contract.client_id ?? '')
    setTemplateId(contract.template_type)
    setContractLanguage(contract.language)
    setTitle(contract.title)
    setStatus(contract.status)
    setPartyA(contract.party_a_snapshot)
    setPartyB(contract.party_b_snapshot)
    setTerms(contract.terms_snapshot)
    setDocument(contract.generated_document)
    setMessage('')
    setError('')
    window.requestAnimationFrame(() => editorRef.current?.focus())
  }

  function duplicateContract(contract: ContractRow) {
    setEditingId(null)
    setClientId(contract.client_id ?? '')
    setTemplateId(contract.template_type)
    setContractLanguage(contract.language)
    setTitle(`${contract.title} ${t('common.copy')}`)
    setStatus('draft')
    setPartyA(contract.party_a_snapshot)
    setPartyB(contract.party_b_snapshot)
    setTerms(contract.terms_snapshot)
    setDocument({
      ...contract.generated_document,
      title: `${contract.generated_document.title || contract.title} ${t('common.copy')}`,
    })
    setMessage(t('contracts.duplicateReady'))
    setError('')
    window.requestAnimationFrame(() => editorRef.current?.focus())
  }

  function updateClause(clauseId: string, patch: Partial<ContractClause>) {
    setDocument((current) => ({
      ...current,
      clauses: current.clauses.map((clause) => clause.id === clauseId ? { ...clause, ...patch } : clause),
    }))
  }

  function moveClause(clauseId: string, direction: -1 | 1) {
    setDocument((current) => {
      const index = current.clauses.findIndex((clause) => clause.id === clauseId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.clauses.length) return current
      const clauses = [...current.clauses]
      const [removed] = clauses.splice(index, 1)
      clauses.splice(nextIndex, 0, removed)
      return { ...current, clauses }
    })
  }

  async function handleGenerate() {
    if (!currentCompany || generating) return
    setGenerating(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          companyId: currentCompany.id,
          templateId,
          language: contractLanguage,
          title,
          jurisdiction: terms.jurisdiction || terms.governingLaw,
          partyA,
          partyB,
          terms,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { document?: GeneratedContractDocument; error?: string }

      if (!response.ok || !payload.document) {
        throw new Error(payload.error || 'contract_generation_failed')
      }

      setDocument(payload.document)
      setTitle((current) => current || payload.document?.title || '')
      setMessage(t('contracts.generated'))
    } catch (generateError) {
      const code = generateError instanceof Error ? generateError.message : ''
      setError(code === 'rate_limited' ? t('contracts.rateLimited') : t('contracts.generationFailed'))
    } finally {
      setGenerating(false)
    }
  }

  async function handleRewriteClause(clause: ContractClause, action: RewriteAction) {
    if (!currentCompany || rewritingClauseId) return
    setRewritingClauseId(clause.id)
    setError('')

    try {
      const response = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rewrite_clause',
          companyId: currentCompany.id,
          language: contractLanguage,
          rewriteAction: t(`contracts.rewrite.${action}`),
          clause: {
            heading: clause.heading,
            body: clause.body,
          },
        }),
      })
      const payload = await response.json().catch(() => ({})) as { clause?: { heading: string; body: string }; error?: string }
      if (!response.ok || !payload.clause) throw new Error(payload.error || 'contract_generation_failed')
      updateClause(clause.id, payload.clause)
      setMessage(t('contracts.clauseRewritten'))
    } catch {
      setError(t('contracts.generationFailed'))
    } finally {
      setRewritingClauseId(null)
    }
  }

  async function handleSave(nextStatus: ContractStatus = status) {
    if (!currentCompany || saving) return
    if (!title.trim()) {
      setError(t('contracts.titleRequired'))
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    const nextDocument = {
      ...document,
      title: document.title || title,
    }
    const payload = {
      company_id: currentCompany.id,
      client_id: clientId || null,
      reference: editingId ? undefined : createContractReference(),
      template_type: templateId,
      language: contractLanguage,
      title: title.trim(),
      status: nextStatus,
      effective_date: terms.effectiveDate || null,
      party_a_snapshot: partyA,
      party_b_snapshot: partyB,
      terms_snapshot: terms,
      generated_document: nextDocument,
      finalized_at: nextStatus === 'finalized' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    try {
      const query = editingId
        ? supabase.from('contracts').update(payload).eq('id', editingId).eq('company_id', currentCompany.id).select('*').single()
        : supabase.from('contracts').insert(payload).select('*').single()

      const { data, error: saveError } = await query
      if (saveError) throw saveError

      const saved = parseContractRow(data as Record<string, unknown>)
      setContracts((current) => [saved, ...current.filter((contract) => contract.id !== saved.id)])
      setEditingId(saved.id)
      setStatus(saved.status)

      await supabase.from('contract_versions').insert({
        contract_id: saved.id,
        company_id: currentCompany.id,
        version_kind: nextStatus === 'finalized' ? 'finalized' : 'draft',
        title: saved.title,
        generated_document: nextDocument,
      })

      setMessage(nextStatus === 'finalized' ? t('contracts.finalizedMessage') : t('contracts.saved'))
    } catch (saveError) {
      const record = saveError as { code?: string }
      setError(record.code === '42P01' || record.code === 'PGRST205'
        ? t('contracts.databaseRequired')
        : t('contracts.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function archiveContract(contract: ContractRow) {
    if (!currentCompany) return
    const confirmed = window.confirm(t('contracts.archiveConfirm'))
    if (!confirmed) return

    const { error: archiveError } = await supabase
      .from('contracts')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', contract.id)
      .eq('company_id', currentCompany.id)

    if (archiveError) {
      setError(t('contracts.saveFailed'))
      return
    }

    setContracts((current) => current.filter((item) => item.id !== contract.id))
    if (editingId === contract.id) resetEditor()
    setMessage(t('contracts.archivedMessage'))
  }

  function printContract() {
    window.print()
  }

  if (companyLoading || loading) {
    return <PageContainer><PageHeader title={t('contracts.title')} /><LoadingSkeleton /></PageContainer>
  }

  if (!currentCompany) {
    return <PageContainer><EmptyState icon={FileText} title={t('common.noWorkspaceSelected')} /></PageContainer>
  }

  return (
    <PageContainer className="max-w-7xl print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <PageHeader
          title={t('contracts.title')}
          description={t('contracts.description')}
        />

        {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-xl">{t('contracts.savedContracts')}</CardTitle>
                <Button size="sm" onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  {t('contracts.create')}
                </Button>
              </div>
              <CardDescription>{t('contracts.legalNotice')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t('contracts.searchPlaceholder')}
              />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <AppSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  ariaLabel={t('contracts.status')}
                  options={[
                    { value: 'all', label: t('common.all') },
                    ...contractStatuses.map((item) => ({ value: item, label: t(`contracts.status.${item}`) })),
                  ]}
                />
                <AppSelect
                  value={languageFilter}
                  onChange={setLanguageFilter}
                  ariaLabel={t('contracts.contractLanguage')}
                  options={[
                    { value: 'all', label: t('common.all') },
                    ...contractLanguages.map((item) => ({ value: item, label: getLanguageName(item) })),
                  ]}
                />
                <AppSelect
                  value={templateFilter}
                  onChange={setTemplateFilter}
                  ariaLabel={t('contracts.template')}
                  options={[
                    { value: 'all', label: t('common.all') },
                    ...contractTemplates.map((item) => ({ value: item.id, label: t(item.labelKey) })),
                  ]}
                />
                <AppSelect
                  value={clientFilter}
                  onChange={setClientFilter}
                  ariaLabel={t('contracts.client')}
                  options={[
                    { value: 'all', label: t('common.all') },
                    ...clients.map((client) => ({ value: client.id, label: client.name })),
                  ]}
                />
              </div>

              <div className="space-y-2">
                {filteredContracts.length === 0 ? (
                  <EmptyState icon={FileText} title={t('contracts.empty')} description={t('contracts.emptyDescription')} />
                ) : filteredContracts.map((contract) => (
                  <div key={contract.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-950" title={contract.title}>{contract.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{contract.reference} · {t(`contracts.status.${contract.status}`)} · {getLanguageName(contract.language)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => editContract(contract)}>
                        {contract.status === 'finalized' ? t('contracts.newVersion') : t('common.edit')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => duplicateContract(contract)}>
                        <Copy className="h-4 w-4" />
                        {t('contracts.duplicate')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={printContract}>
                        <Printer className="h-4 w-4" />
                        {t('common.print')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => archiveContract(contract)}>
                        <Archive className="h-4 w-4" />
                        {t('contracts.archive')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card ref={editorRef} tabIndex={-1} className="outline-none">
            <CardHeader>
              <CardTitle className="text-xl">{editingId ? t('contracts.edit') : t('contracts.create')}</CardTitle>
              <CardDescription>{t('contracts.editorDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm font-medium">{t('contracts.contractTitle')}</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('contracts.template')}</span>
                  <AppSelect
                    value={templateId}
                    onChange={(value) => setTemplateId(value as ContractTemplateId)}
                    options={contractTemplates.map((item) => ({ value: item.id, label: t(item.labelKey) }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('contracts.contractLanguage')}</span>
                  <AppSelect
                    value={contractLanguage}
                    onChange={(value) => setContractLanguage(value as ContractLanguage)}
                    options={contractLanguages.map((item) => ({ value: item, label: getLanguageName(item) }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('contracts.client')}</span>
                  <AppSelect
                    value={clientId}
                    onChange={handleClientChange}
                    options={[{ value: '', label: t('contracts.manualParty') }, ...clients.map((client) => ({ value: client.id, label: client.name }))]}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('contracts.statusLabel')}</span>
                  <AppSelect
                    value={status}
                    onChange={(value) => setStatus(value as ContractStatus)}
                    options={contractStatuses.filter((item) => item !== 'archived').map((item) => ({ value: item, label: t(`contracts.status.${item}`) }))}
                  />
                </label>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {t('contracts.legalNotice')}
              </div>

              <section className="grid gap-4 lg:grid-cols-2">
                <PartyEditor title={t('contracts.partyA')} party={partyA} onChange={setPartyA} t={t} />
                <PartyEditor title={t('contracts.partyB')} party={partyB} onChange={setPartyB} t={t} />
              </section>

              <section>
                <h3 className="mb-3 text-lg font-semibold">{t('contracts.terms')}</h3>
                <p className="mb-4 text-sm text-slate-500">{t(template.descriptionKey)}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {template.fields.map((field) => (
                    <label key={field.key} className={`space-y-1 ${['projectDescription', 'scope', 'deliverables', 'milestones', 'additionalClauses', 'customNotes'].includes(field.key) ? 'md:col-span-2' : ''}`}>
                      <span className="text-sm font-medium">
                        {t(`contracts.field.${field.key}`)}
                        {field.required && <span className="text-red-600"> *</span>}
                      </span>
                      {['projectDescription', 'scope', 'deliverables', 'milestones', 'additionalClauses', 'customNotes', 'intellectualProperty', 'confidentiality', 'termination', 'liability'].includes(field.key) ? (
                        <textarea
                          value={terms[field.key]}
                          onChange={(event) => setTerms((current) => ({ ...current, [field.key]: event.target.value }))}
                          className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                        />
                      ) : (
                        <input
                          type={field.key.toLowerCase().includes('date') ? 'date' : 'text'}
                          value={terms[field.key]}
                          onChange={(event) => setTerms((current) => ({ ...current, [field.key]: event.target.value }))}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{t('contracts.document')}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={handleGenerate} disabled={generating}>
                      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {t('contracts.generateDraft')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setDocument((current) => ({ ...current, clauses: [...current.clauses, createClause()] }))}>
                      <Plus className="h-4 w-4" />
                      {t('contracts.addClause')}
                    </Button>
                  </div>
                </div>

                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('contracts.documentTitle')}</span>
                  <input value={document.title} onChange={(event) => setDocument((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('contracts.introduction')}</span>
                  <textarea value={document.introduction} onChange={(event) => setDocument((current) => ({ ...current, introduction: event.target.value }))} className="min-h-24 w-full rounded-md border px-3 py-2 text-sm" />
                </label>

                <div className="space-y-3">
                  {document.clauses.map((clause, index) => (
                    <div key={clause.id} className="rounded-md border border-slate-200 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <GripVertical className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium">{t('contracts.clause')} {index + 1}</span>
                        <div className="ml-auto flex flex-wrap gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => moveClause(clause.id, -1)} disabled={index === 0}>↑</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => moveClause(clause.id, 1)} disabled={index === document.clauses.length - 1}>↓</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDocument((current) => ({ ...current, clauses: current.clauses.filter((item) => item.id !== clause.id) }))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <input value={clause.heading} onChange={(event) => updateClause(clause.id, { heading: event.target.value })} className="mb-2 w-full rounded-md border px-3 py-2 text-sm font-medium" placeholder={t('contracts.clauseHeading')} />
                      <textarea value={clause.body} onChange={(event) => updateClause(clause.id, { body: event.target.value })} className="min-h-32 w-full rounded-md border px-3 py-2 text-sm" placeholder={t('contracts.clauseBody')} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {rewriteActions.map((action) => (
                          <Button key={action} type="button" size="sm" variant="outline" onClick={() => handleRewriteClause(clause, action)} disabled={rewritingClauseId !== null}>
                            {rewritingClauseId === clause.id && <Loader2 className="h-4 w-4 animate-spin" />}
                            {t(`contracts.rewrite.${action}`)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('contracts.closing')}</span>
                  <textarea value={document.closing} onChange={(event) => setDocument((current) => ({ ...current, closing: event.target.value }))} className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" />
                </label>
              </section>

              <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-end gap-2 border-t bg-white/95 px-6 py-4 backdrop-blur">
                <Button type="button" variant="outline" onClick={printContract}>
                  <Printer className="h-4 w-4" />
                  {t('contracts.exportPdf')}
                </Button>
                <Button type="button" variant="outline" onClick={() => handleSave('draft')} disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? t('common.loading') : t('contracts.saveDraft')}
                </Button>
                <Button type="button" onClick={() => handleSave('finalized')} disabled={saving}>
                  {saving ? t('common.loading') : t('contracts.finalize')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PrintableContract
        reference={editingId ? contracts.find((contract) => contract.id === editingId)?.reference ?? createContractReference() : createContractReference()}
        title={document.title || title}
        partyA={partyA}
        partyB={partyB}
        document={document}
        legalNotice={t('contracts.legalNotice')}
        t={t}
      />
    </PageContainer>
  )
}

function PartyEditor({
  title,
  party,
  onChange,
  t,
}: {
  title: string
  party: ContractPartySnapshot
  onChange: (party: ContractPartySnapshot) => void
  t: (key: string) => string
}) {
  const update = (key: keyof ContractPartySnapshot, value: string) => onChange({ ...party, [key]: value })

  return (
    <div className="rounded-md border border-slate-200 p-4">
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['name', 'company', 'email', 'phone', 'taxId', 'representative', 'country'] as Array<keyof ContractPartySnapshot>).map((field) => (
          <label key={field} className="space-y-1">
            <span className="text-sm font-medium">{t(`contracts.party.${field}`)}</span>
            <input value={party[field]} onChange={(event) => update(field, event.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
          </label>
        ))}
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">{t('contracts.party.address')}</span>
          <textarea value={party.address} onChange={(event) => update('address', event.target.value)} className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" />
        </label>
      </div>
    </div>
  )
}

function PrintableContract({
  reference,
  title,
  partyA,
  partyB,
  document,
  legalNotice,
  t,
}: {
  reference: string
  title: string
  partyA: ContractPartySnapshot
  partyB: ContractPartySnapshot
  document: GeneratedContractDocument
  legalNotice: string
  t: (key: string) => string
}) {
  return (
    <article className="hidden print:block print:mx-auto print:w-[90%] print:bg-white print:text-black">
      <header className="mb-8 border-b pb-4">
        <p className="text-sm uppercase tracking-wide">{reference}</p>
        <h1 className="mt-2 text-3xl font-bold">{title || document.title}</h1>
      </header>
      <section className="mb-8 grid grid-cols-2 gap-8 text-sm">
        <div>
          <h2 className="mb-2 text-base font-semibold">{t('contracts.partyA')}</h2>
          <PartyPrint party={partyA} />
        </div>
        <div>
          <h2 className="mb-2 text-base font-semibold">{t('contracts.partyB')}</h2>
          <PartyPrint party={partyB} />
        </div>
      </section>
      {document.introduction && <p className="mb-6 whitespace-pre-wrap leading-7">{document.introduction}</p>}
      <section className="space-y-6">
        {document.clauses.map((clause, index) => (
          <div key={clause.id} className="break-inside-avoid">
            <h2 className="mb-2 text-lg font-semibold">{index + 1}. {clause.heading}</h2>
            <p className="whitespace-pre-wrap leading-7">{clause.body}</p>
          </div>
        ))}
      </section>
      {document.closing && <p className="mt-8 whitespace-pre-wrap leading-7">{document.closing}</p>}
      <section className="mt-12 grid grid-cols-2 gap-10 text-sm">
        <SignatureBlock title={t('contracts.partyA')} t={t} />
        <SignatureBlock title={t('contracts.partyB')} t={t} />
      </section>
      <footer className="mt-10 border-t pt-4 text-xs text-slate-600">
        {legalNotice}
      </footer>
    </article>
  )
}

function PartyPrint({ party }: { party: ContractPartySnapshot }) {
  return (
    <div className="space-y-1">
      {[party.company, party.name, party.representative, party.address, party.email, party.phone, party.taxId].filter(Boolean).map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

function SignatureBlock({ title, t }: { title: string; t: (key: string) => string }) {
  return (
    <div className="space-y-6">
      <p className="font-semibold">{title}</p>
      <div className="border-b border-black pb-6" />
      <div className="grid grid-cols-2 gap-4">
        <p>{t('contracts.signatureName')}</p>
        <p>{t('contracts.signatureDate')}</p>
      </div>
    </div>
  )
}
