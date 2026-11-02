'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, Building2, FileSignature, FileText, Mail, Pencil, Phone } from 'lucide-react'
import { ClientForm } from '@/components/clients/client-form'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCountryValue } from '@/lib/countries'
import { formatCurrencyGroups, type ClientRecord } from '@/lib/client-crm'
import { useCurrencyFormat } from '@/contexts/currency-format-context'
import { buildClientInvoiceHref, buildClientInvoicesHref } from '@/lib/client-invoice-navigation'
import { buildClientContractHref } from '@/lib/contract-client-routing'
import { getIntlLocale, type Locale } from '@/lib/i18n'
import { createClient } from '@/lib/supabase-client'

type DetailTab = 'overview' | 'contacts' | 'invoices' | 'contracts' | 'activity' | 'notes'

interface InvoiceRow {
  id: string
  invoice_number: string
  issue_date: string
  total: number | string
  currency: string
  status: string
  created_at: string
  paid_amount?: number
}

interface ContractRow {
  id: string
  reference: string
  title: string
  status: string
  language: string
  created_at: string
  updated_at: string
}

interface ClientTransactionRow {
  id: string
  type: 'income' | 'expense'
  title: string | null
  description: string | null
  amount: number | string
  currency: string
  date: string
  invoice_id: string | null
}

function sumInvoices(invoices: InvoiceRow[], kind: 'paid' | 'unpaid') {
  return invoices.reduce<Record<string, number>>((result, invoice) => {
    const total = Number(invoice.total || 0)
    const amount = kind === 'paid'
      ? invoice.paid_amount ?? (invoice.status === 'paid' ? total : 0)
      : invoice.status === 'sent' || invoice.status === 'overdue' ? Math.max(0, total - (invoice.paid_amount ?? 0)) : 0
    if (amount <= 0) return result
    result[invoice.currency] = (result[invoice.currency] ?? 0) + amount
    return result
  }, {})
}

export default function ClientDetailPage() {
  const { position: currencySymbolPosition } = useCurrencyFormat()
  const params = useParams<{ id: string }>()
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [transactions, setTransactions] = useState<ClientTransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [error, setError] = useState('')
  const [relatedDataError, setRelatedDataError] = useState(false)
  const requestId = useRef(0)

  const loadClient = useCallback(async () => {
    if (!currentCompany || !params.id) {
      setLoading(false)
      return
    }
    const activeRequest = ++requestId.current
    const companyId = currentCompany.id
    setLoading(true)
    setError('')
    setRelatedDataError(false)

    const results = await Promise.all([
      supabase
        .from('clients')
        .select('id, company_id, name, email, phone, client_company, street, house_number, postal_code, city, country, tax_number, interested_in, notes, source, external_id, first_contact_at, last_activity_at, status, created_at, updated_at')
        .eq('company_id', currentCompany.id)
        .eq('id', params.id)
        .maybeSingle(),
      supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, total, currency, status, created_at')
        .eq('company_id', currentCompany.id)
        .eq('client_id', params.id)
        .order('issue_date', { ascending: false }),
      supabase
        .from('contracts')
        .select('id, reference, title, status, language, created_at, updated_at')
        .eq('company_id', currentCompany.id)
        .eq('client_id', params.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('incomes')
        .select('id, title, description, amount, currency, date, invoice_id')
        .eq('company_id', currentCompany.id)
        .eq('client_id', params.id)
        .order('date', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, title, description, amount, currency, date, invoice_id')
        .eq('company_id', currentCompany.id)
        .eq('client_id', params.id)
        .order('date', { ascending: false }),
    ])
    let clientResult = results[0]
    const invoiceResult = results[1]
    const contractResult = results[2]
    const incomeResult = results[3]
    const expenseResult = results[4]

    if (clientResult.error && ['42703', 'PGRST204', 'PGRST205'].includes(clientResult.error.code ?? '')) {
      clientResult = await supabase
        .from('clients')
        .select('id, company_id, name, email, phone, client_company, interested_in, notes, status, created_at, updated_at')
        .eq('company_id', currentCompany.id)
        .eq('id', params.id)
        .maybeSingle() as typeof clientResult
    }

    if (clientResult.error) {
      if (activeRequest !== requestId.current) return
      setError(t('clients.crm.loadFailed'))
      setLoading(false)
      return
    }

    if (activeRequest !== requestId.current || currentCompany?.id !== companyId) return

    const relatedErrors = [invoiceResult.error, contractResult.error, incomeResult.error, expenseResult.error]
      .some((result) => Boolean(result))
    if (relatedErrors) {
      setRelatedDataError(true)
      setError(t('clients.crm.relatedDataLoadFailed'))
    }

    const invoiceRows = invoiceResult.error ? [] : (invoiceResult.data ?? []) as InvoiceRow[]
    if (invoiceRows.length > 0) {
      const paymentResult = await supabase
        .from('invoice_payments')
        .select('invoice_id, amount')
        .eq('company_id', currentCompany.id)
        .in('invoice_id', invoiceRows.map((invoice) => invoice.id))
      if (activeRequest !== requestId.current || currentCompany?.id !== companyId) return
      if (!paymentResult.error) {
        const paymentTotals = new Map<string, number>()
        for (const payment of paymentResult.data ?? []) paymentTotals.set(payment.invoice_id, (paymentTotals.get(payment.invoice_id) ?? 0) + Number(payment.amount || 0))
        for (const invoice of invoiceRows) invoice.paid_amount = paymentTotals.get(invoice.id)
      } else {
        setRelatedDataError(true)
        setError(t('clients.crm.relatedDataLoadFailed'))
      }
    }
    if (activeRequest !== requestId.current || currentCompany?.id !== companyId) return
    setClient(clientResult.data ? {
      street: null,
      house_number: null,
      postal_code: null,
      city: null,
      country: null,
      tax_number: null,
      source: null,
      external_id: null,
      first_contact_at: null,
      last_activity_at: null,
      ...(clientResult.data as unknown as Record<string, unknown>),
    } as ClientRecord : null)
    setInvoices(invoiceRows)
    setContracts(contractResult.error ? [] : (contractResult.data ?? []) as ContractRow[])
    setTransactions([
      ...(incomeResult.error ? [] : (incomeResult.data ?? []).map((row) => ({ ...row, type: 'income' as const }))),
      ...(expenseResult.error ? [] : (expenseResult.data ?? []).map((row) => ({ ...row, type: 'expense' as const }))),
    ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()) as ClientTransactionRow[])
    setLoading(false)
  }, [currentCompany, params.id, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadClient()
    })
    return () => {
      cancelled = true
      requestId.current += 1
    }
  }, [loadClient])

  const paid = useMemo(() => sumInvoices(invoices, 'paid'), [invoices])
  const unpaid = useMemo(() => sumInvoices(invoices, 'unpaid'), [invoices])
  const activity = useMemo(() => [
    ...(client ? [
      { id: `created-${client.id}`, date: client.created_at, label: t('clients.crm.activityClientCreated') },
      ...(client.updated_at && client.updated_at !== client.created_at ? [{ id: `updated-${client.id}`, date: client.updated_at, label: t('clients.crm.activityClientUpdated') }] : []),
    ] : []),
    ...invoices.map((invoice) => ({ id: `invoice-${invoice.id}`, date: invoice.created_at, label: t('clients.crm.activityInvoiceCreated'), detail: `${invoice.invoice_number} · ${t(`invoices.status.${invoice.status}`)}`, href: client ? buildClientInvoiceHref(client.id, invoice.id) : undefined })),
    ...contracts.map((contract) => ({ id: `contract-${contract.id}`, date: contract.created_at, label: t('clients.crm.activityContractCreated'), detail: contract.reference, href: client ? buildClientContractHref(contract.id, client.id) : undefined })),
    ...transactions.map((transaction) => ({ id: `transaction-${transaction.type}-${transaction.id}`, date: transaction.date, label: t(transaction.type === 'income' ? 'income.title' : 'expenses.title'), detail: transaction.title || transaction.description || undefined })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()).slice(0, 20), [client, contracts, invoices, t, transactions])

  const archive = async () => {
    if (!client || !currentCompany || !window.confirm(t('clients.crm.archiveConfirm'))) return
    const { error: archiveError } = await supabase
      .from('clients')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', client.id)
      .eq('company_id', currentCompany.id)
    if (archiveError) setError(t('clients.crm.archiveFailed'))
    else await loadClient()
  }

  if (companyLoading || loading) return <PageContainer><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} description={t('dashboard.noWorkspace')} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><EmptyState icon={Building2} title={t('common.businessOnlyTitle')} description={t('common.businessOnlyDescription')} /></PageContainer>
  if (!client) return <PageContainer><EmptyState title={t('clients.crm.notFound')} description={error || t('clients.crm.notFoundDescription')} /></PageContainer>

  const tabs: DetailTab[] = ['overview', 'contacts', 'invoices', 'contracts', 'activity', 'notes']
  const address = [[client.street, client.house_number].filter(Boolean).join(' '), [client.postal_code, client.city].filter(Boolean).join(' '), formatCountryValue(client.country, locale)].filter(Boolean).join(', ')

  return (
    <PageContainer>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm"><Link href="/app/clients"><ArrowLeft className="h-4 w-4" />{t('clients.crm.backToClients')}</Link></Button>
      </div>
      <PageHeader title={client.client_company || client.name} description={client.client_company ? client.name : client.email || client.phone || t('clients.crm.clientRecord')}>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={buildClientInvoicesHref(client.id, { create: true })}><FileText className="h-4 w-4" />{t('clients.crm.createInvoice')}</Link></Button>
          <Button asChild variant="outline"><Link href={`/app/contracts/new?clientId=${encodeURIComponent(client.id)}`}><FileSignature className="h-4 w-4" />{t('clients.crm.createContract')}</Link></Button>
          <Button variant="outline" onClick={() => setEditing((value) => !value)}><Pencil className="h-4 w-4" />{t('common.edit')}</Button>
          {client.status !== 'inactive' && <Button variant="outline" onClick={() => void archive()}><Archive className="h-4 w-4" />{t('clients.crm.archive')}</Button>}
        </div>
      </PageHeader>

      {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {editing && <Card className="mb-6"><CardContent className="p-4 sm:p-6"><ClientForm client={client} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void loadClient() }} /></CardContent></Card>}

      <div className="mb-5 md:hidden">
        <AppSelect value={tab} onChange={(value) => setTab(value as DetailTab)} options={tabs.map((item) => ({ value: item, label: t(`clients.crm.tabs.${item}`) }))} />
      </div>
      <div className="mb-5 hidden overflow-x-auto border-b border-slate-200 md:flex" role="tablist">
        {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${tab === item ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{t(`clients.crm.tabs.${item}`)}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={t('clients.crm.outstanding')} value={relatedDataError ? '—' : formatCurrencyGroups(unpaid, getIntlLocale(locale), currentCompany.currency ?? 'EUR', currencySymbolPosition)} />
            <Metric label={t('clients.crm.paidTotal')} value={relatedDataError ? '—' : formatCurrencyGroups(paid, getIntlLocale(locale), currentCompany.currency ?? 'EUR', currencySymbolPosition)} />
            <Metric label={t('clients.crm.invoiceCount')} value={relatedDataError ? '—' : String(invoices.length)} />
            <Metric label={t('clients.crm.contractCount')} value={relatedDataError ? '—' : String(contracts.length)} />
          </div>
          {!relatedDataError && <OutstandingInvoices invoices={invoices} clientId={client.id} locale={locale} t={t} currencySymbolPosition={currencySymbolPosition} />}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>{t('clients.crm.information')}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-slate-700">
              {client.email && <p className="flex min-w-0 gap-2"><Mail className="h-4 w-4 shrink-0" /><span className="break-all">{client.email}</span></p>}
              {client.phone && <p className="flex gap-2"><Phone className="h-4 w-4 shrink-0" /><span>{client.phone}</span></p>}
              {address && <p>{address}</p>}
              {client.tax_number && <p>{t('clients.taxNumber')}: {client.tax_number}</p>}
              <p>{t('clients.status')}: {t(`clients.status.${client.status}`)}</p>
            </CardContent></Card>
            <ActivityList items={activity.slice(0, 8)} t={t} locale={locale} />
          </div>
        </div>
      )}

      {tab === 'invoices' && <InvoiceList invoices={invoices} clientId={client.id} locale={locale} t={t} currencySymbolPosition={currencySymbolPosition} />}
      {tab === 'contracts' && <ContractList contracts={contracts} clientId={client.id} locale={locale} t={t} />}
      {tab === 'activity' && <ActivityList items={activity} t={t} locale={locale} />}
      {tab === 'contacts' && <Card><CardContent className="space-y-3 p-5 text-sm"><p>{client.name}</p><p className="break-all">{client.email || '—'}</p><p>{client.phone || '—'}</p><p>{address || '—'}</p></CardContent></Card>}
      {tab === 'notes' && <Card><CardContent className="whitespace-pre-wrap p-5 text-sm text-slate-700">{client.notes || t('clients.crm.noNotes')}</CardContent></Card>}
    </PageContainer>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 break-words text-xl font-semibold text-slate-950">{value}</p></CardContent></Card>
}

function OutstandingInvoices({ invoices, clientId, locale, t, currencySymbolPosition }: { invoices: InvoiceRow[]; clientId: string; locale: Locale; t: (key: string) => string; currencySymbolPosition: import('@/lib/currency').CurrencySymbolPosition }) {
  const outstanding = invoices.filter((invoice) => (
    (invoice.status === 'sent' || invoice.status === 'overdue')
    && Number(invoice.total || 0) - (invoice.paid_amount ?? 0) > 0
  )).slice(0, 5)

  return <Card><CardHeader><CardTitle>{t('clients.crm.outstandingInvoices')}</CardTitle></CardHeader><CardContent>{outstanding.length === 0 ? <p className="text-sm text-slate-500">{t('clients.crm.noOutstandingInvoices')}</p> : <ul className="divide-y divide-slate-100">{outstanding.map((invoice) => {
    const remaining = Math.max(0, Number(invoice.total || 0) - (invoice.paid_amount ?? 0))
    return <li key={invoice.id} className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><div className="min-w-0"><Link className="break-all text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline" href={buildClientInvoiceHref(clientId, invoice.id)}>{invoice.invoice_number}</Link><p className="text-xs text-slate-500">{t(`invoices.status.${invoice.status}`)} · {new Intl.DateTimeFormat(getIntlLocale(locale)).format(new Date(invoice.issue_date))}</p></div><p className="font-semibold tabular-nums">{formatCurrencyGroups({ [invoice.currency]: remaining }, getIntlLocale(locale), 'EUR', currencySymbolPosition)}</p></li>
  })}</ul>}</CardContent></Card>
}

function ActivityList({ items, t, locale }: { items: Array<{ id: string; date: string; label: string; detail?: string; href?: string }>; t: (key: string) => string; locale: Locale }) {
  return <Card><CardHeader><CardTitle>{t('clients.crm.recentActivity')}</CardTitle></CardHeader><CardContent>{items.length === 0 ? <p className="text-sm text-slate-500">{t('clients.crm.noActivity')}</p> : <ol className="space-y-4">{items.map((item) => <li key={item.id} className="border-l-2 border-slate-200 pl-4"><p className="text-sm font-medium text-slate-900">{item.href ? <Link className="hover:text-blue-700 hover:underline" href={item.href}>{item.label}{item.detail ? ` · ${item.detail}` : ''}</Link> : <>{item.label}{item.detail ? ` · ${item.detail}` : ''}</>}</p><p className="text-xs text-slate-500">{new Intl.DateTimeFormat(getIntlLocale(locale), { dateStyle: 'medium' }).format(new Date(item.date))}</p></li>)}</ol>}</CardContent></Card>
}

function InvoiceList({ invoices, clientId, locale, t, currencySymbolPosition }: { invoices: InvoiceRow[]; clientId: string; locale: Locale; t: (key: string) => string; currencySymbolPosition: import('@/lib/currency').CurrencySymbolPosition }) {
  if (invoices.length === 0) return <div><EmptyState title={t('clients.crm.noInvoices')} description={t('clients.crm.noInvoicesDescription')} /><div className="-mt-8 hidden justify-center lg:flex"><Button asChild><Link href={buildClientInvoicesHref(clientId, { create: true })}>{t('clients.crm.createInvoice')}</Link></Button></div></div>
  return <div className="grid gap-3">{invoices.map((invoice) => <Card key={invoice.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><Link className="break-words font-medium text-slate-950 hover:text-blue-700 hover:underline" href={buildClientInvoiceHref(clientId, invoice.id)}>{invoice.invoice_number}</Link><p className="text-sm text-slate-500">{new Intl.DateTimeFormat(getIntlLocale(locale)).format(new Date(invoice.issue_date))} · {t(`invoices.status.${invoice.status}`)}</p></div><p className="font-semibold">{formatCurrencyGroups({ [invoice.currency]: Number(invoice.total) }, getIntlLocale(locale), 'EUR', currencySymbolPosition)}</p></CardContent></Card>)}</div>
}

function ContractList({ contracts, clientId, locale, t }: { contracts: ContractRow[]; clientId: string; locale: Locale; t: (key: string) => string }) {
  if (contracts.length === 0) return <EmptyState title={t('clients.crm.noContracts')} description={t('clients.crm.noContractsDescription')} />
  return <div className="grid gap-3">{contracts.map((contract) => <Card key={contract.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><Link className="break-words font-medium text-slate-950 hover:text-blue-700 hover:underline" href={buildClientContractHref(contract.id, clientId)}>{contract.title}</Link><p className="text-sm text-slate-500">{contract.reference} · {t(`contracts.status.${contract.status}`)} · {new Intl.DateTimeFormat(getIntlLocale(locale)).format(new Date(contract.updated_at))}</p></div><Button asChild variant="outline" size="sm"><Link href={buildClientContractHref(contract.id, clientId)}>{t('clients.crm.open')}</Link></Button></CardContent></Card>)}</div>
}
