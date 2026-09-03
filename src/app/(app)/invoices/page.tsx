'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Edit, FileText, PackagePlus, Printer, Trash2 } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
import { Logo } from '@/components/logo'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { loadCompanyBranding } from '@/lib/company-branding'
import { currencyOptions, formatCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { createClient } from '@/lib/supabase-client'
import { getIntlLocale } from '@/lib/i18n'

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
const visibleInvoiceStatuses = ['sent', 'cancelled', 'paid'] as const

const taxCountries = [
  { code: 'AL', label: 'Albania', standardRate: 20, reducedRate: 6 },
  { code: 'AD', label: 'Andorra', standardRate: 4.5, reducedRate: 1 },
  { code: 'AT', label: 'Austria', standardRate: 20, reducedRate: 10 },
  { code: 'BY', label: 'Belarus', standardRate: 20, reducedRate: 10 },
  { code: 'BE', label: 'Belgium', standardRate: 21, reducedRate: 6 },
  { code: 'BA', label: 'Bosnia and Herzegovina', standardRate: 17, reducedRate: 17 },
  { code: 'BG', label: 'Bulgaria', standardRate: 20, reducedRate: 9 },
  { code: 'HR', label: 'Croatia', standardRate: 25, reducedRate: 13 },
  { code: 'CY', label: 'Cyprus', standardRate: 19, reducedRate: 5 },
  { code: 'CZ', label: 'Czechia', standardRate: 21, reducedRate: 12 },
  { code: 'DK', label: 'Denmark', standardRate: 25, reducedRate: 25 },
  { code: 'EE', label: 'Estonia', standardRate: 24, reducedRate: 9 },
  { code: 'FI', label: 'Finland', standardRate: 25.5, reducedRate: 14 },
  { code: 'FR', label: 'France', standardRate: 20, reducedRate: 5.5 },
  { code: 'GE', label: 'Georgia', standardRate: 18, reducedRate: 18 },
  { code: 'DE', label: 'Germany', standardRate: 19, reducedRate: 7 },
  { code: 'GR', label: 'Greece', standardRate: 24, reducedRate: 13 },
  { code: 'HU', label: 'Hungary', standardRate: 27, reducedRate: 18 },
  { code: 'IS', label: 'Iceland', standardRate: 24, reducedRate: 11 },
  { code: 'IE', label: 'Ireland', standardRate: 23, reducedRate: 13.5 },
  { code: 'IT', label: 'Italy', standardRate: 22, reducedRate: 10 },
  { code: 'XK', label: 'Kosovo', standardRate: 18, reducedRate: 8 },
  { code: 'LV', label: 'Latvia', standardRate: 21, reducedRate: 12 },
  { code: 'LI', label: 'Liechtenstein', standardRate: 8.1, reducedRate: 2.6 },
  { code: 'LT', label: 'Lithuania', standardRate: 21, reducedRate: 9 },
  { code: 'LU', label: 'Luxembourg', standardRate: 17, reducedRate: 8 },
  { code: 'MT', label: 'Malta', standardRate: 18, reducedRate: 7 },
  { code: 'MD', label: 'Moldova', standardRate: 20, reducedRate: 8 },
  { code: 'MC', label: 'Monaco', standardRate: 20, reducedRate: 5.5 },
  { code: 'ME', label: 'Montenegro', standardRate: 21, reducedRate: 7 },
  { code: 'NL', label: 'Netherlands', standardRate: 21, reducedRate: 9 },
  { code: 'MK', label: 'North Macedonia', standardRate: 18, reducedRate: 5 },
  { code: 'NO', label: 'Norway', standardRate: 25, reducedRate: 15 },
  { code: 'PL', label: 'Poland', standardRate: 23, reducedRate: 8 },
  { code: 'PT', label: 'Portugal', standardRate: 23, reducedRate: 13 },
  { code: 'PT-AZ', label: 'Portugal (Azores)', standardRate: 18, reducedRate: 9 },
  { code: 'PT-MA', label: 'Portugal (Madeira)', standardRate: 22, reducedRate: 12 },
  { code: 'RO', label: 'Romania', standardRate: 19, reducedRate: 9 },
  { code: 'RU', label: 'Russia', standardRate: 20, reducedRate: 10 },
  { code: 'SM', label: 'San Marino', standardRate: 22, reducedRate: 10 },
  { code: 'RS', label: 'Serbia', standardRate: 20, reducedRate: 10 },
  { code: 'SK', label: 'Slovakia', standardRate: 23, reducedRate: 19 },
  { code: 'SI', label: 'Slovenia', standardRate: 22, reducedRate: 9.5 },
  { code: 'ES', label: 'Spain', standardRate: 21, reducedRate: 10 },
  { code: 'ES-IC', label: 'Spain (Canary Islands IGIC)', standardRate: 7, reducedRate: 3 },
  { code: 'SE', label: 'Sweden', standardRate: 25, reducedRate: 12 },
  { code: 'CH', label: 'Switzerland', standardRate: 8.1, reducedRate: 2.6 },
  { code: 'TR', label: 'Türkiye', standardRate: 20, reducedRate: 10 },
  { code: 'UA', label: 'Ukraine', standardRate: 20, reducedRate: 7 },
  { code: 'GB', label: 'United Kingdom', standardRate: 20, reducedRate: 5 },
] as const

type TaxCountryCode = typeof taxCountries[number]['code']
type TaxType = 'standard' | 'reduced' | 'none'

interface ClientOption {
  id: string
  name: string
  email: string | null
  phone: string | null
  client_company: string | null
  street: string | null
  house_number: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  tax_number: string | null
}

interface ProductOption {
  id: string
  name: string
  sku: string | null
  selling_price: number | string | null
  currency: string
  current_stock: number | string
}

interface InvoiceItem {
  id?: string
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  line_total: number
}

interface InvoiceRecord {
  id: string
  company_id: string
  client_id: string | null
  invoice_number: string
  issue_date: string
  due_date: string | null
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  status: InvoiceStatus
  notes: string | null
  created_at: string
  clients?: ClientOption | null
  invoice_items?: InvoiceItem[]
}

interface InvoiceFormState {
  client_id: string
  invoice_number: string
  issue_date: string
  due_date: string
  currency: string
  status: InvoiceStatus
  notes: string
  tax_country: TaxCountryCode
  tax_type: TaxType
  payment_method: 'cash' | 'card'
  amount_paid: string
  items: InvoiceItem[]
}

type InvoiceNumberFormat = 'yy-seq' | 'yyyy-seq'

interface InvoicePaymentMeta {
  method: 'cash' | 'card'
  amountPaid: string
}

interface InvoiceClientPrintFields {
  company: boolean
  email: boolean
  phone: boolean
  address: boolean
  taxNumber: boolean
}

const defaultClientPrintFields: InvoiceClientPrintFields = {
  company: true,
  email: true,
  phone: true,
  address: true,
  taxNumber: true,
}

function getInvoicePaymentKey(invoiceId: string) {
  return `leonety-invoice-payment:${invoiceId}`
}

function loadInvoicePaymentMeta(invoiceId: string | null | undefined): InvoicePaymentMeta {
  if (!invoiceId || typeof window === 'undefined') {
    return { method: 'card', amountPaid: '' }
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getInvoicePaymentKey(invoiceId)) ?? '{}') as Partial<InvoicePaymentMeta>
    return {
      method: parsed.method === 'cash' ? 'cash' : 'card',
      amountPaid: typeof parsed.amountPaid === 'string' ? parsed.amountPaid : '',
    }
  } catch {
    return { method: 'card', amountPaid: '' }
  }
}

function saveInvoicePaymentMeta(invoiceId: string, meta: InvoicePaymentMeta) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getInvoicePaymentKey(invoiceId), JSON.stringify(meta))
}

function getClientPrintFieldsKey(companyId: string) {
  return `leonety-invoice-client-print-fields:${companyId}`
}

function loadClientPrintFields(companyId: string | null | undefined): InvoiceClientPrintFields {
  if (!companyId || typeof window === 'undefined') return defaultClientPrintFields

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getClientPrintFieldsKey(companyId)) ?? '{}') as Partial<InvoiceClientPrintFields>
    return {
      company: typeof parsed.company === 'boolean' ? parsed.company : true,
      email: typeof parsed.email === 'boolean' ? parsed.email : true,
      phone: typeof parsed.phone === 'boolean' ? parsed.phone : true,
      address: typeof parsed.address === 'boolean' ? parsed.address : true,
      taxNumber: typeof parsed.taxNumber === 'boolean' ? parsed.taxNumber : true,
    }
  } catch {
    return defaultClientPrintFields
  }
}

function saveClientPrintFields(companyId: string, fields: InvoiceClientPrintFields) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getClientPrintFieldsKey(companyId), JSON.stringify(fields))
}

const newItem = (taxRate = 19): InvoiceItem => ({
  description: '',
  quantity: 1,
  unit_price: 0,
  tax_rate: taxRate,
  line_total: 0,
})

function formatInvoiceStatus(status: InvoiceStatus, t: (key: string) => string) {
  return t(`invoices.status.${status}`)
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function calculateItems(items: InvoiceItem[]) {
  const normalizedItems = items.map((item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0)
    const unitPrice = Math.max(0, Number(item.unit_price) || 0)
    const taxRate = Math.max(0, Number(item.tax_rate) || 0)
    const lineTotal = Number((quantity * unitPrice).toFixed(2))

    return {
      ...item,
      quantity,
      unit_price: unitPrice,
      tax_rate: taxRate,
      line_total: lineTotal,
    }
  })
  const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2))
  const taxAmount = Number(normalizedItems.reduce((sum, item) => sum + item.line_total * (item.tax_rate / 100), 0).toFixed(2))

  return {
    items: normalizedItems,
    subtotal,
    taxAmount,
    total: Number((subtotal + taxAmount).toFixed(2)),
  }
}

function getInvoiceNumberSettings() {
  if (typeof window === 'undefined') {
    return { format: 'yy-seq' as InvoiceNumberFormat, digits: 3, prefix: '', separator: '-', nextNumber: 1, resetAnnually: true }
  }

  const savedFormat = window.localStorage.getItem('leonety-invoice-number-format') as InvoiceNumberFormat | null
  const savedDigits = Number(window.localStorage.getItem('leonety-invoice-number-digits'))
  const savedNextNumber = Number(window.localStorage.getItem('leonety-invoice-number-next'))
  const savedSeparator = window.localStorage.getItem('leonety-invoice-number-separator') ?? '-'

  return {
    format: savedFormat === 'yyyy-seq' ? savedFormat : 'yy-seq',
    digits: [3, 4, 5].includes(savedDigits) ? savedDigits : 3,
    prefix: (window.localStorage.getItem('leonety-invoice-number-prefix') ?? '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
    separator: ['-', '/', '.'].includes(savedSeparator) ? savedSeparator : '-',
    nextNumber: Number.isFinite(savedNextNumber) && savedNextNumber > 0 ? Math.floor(savedNextNumber) : 1,
    resetAnnually: window.localStorage.getItem('leonety-invoice-number-reset-annually') !== 'false',
  }
}

function makeInvoiceNumber(existingInvoices: InvoiceRecord[] = []) {
  const date = new Date()
  const settings = getInvoiceNumberSettings()
  const yearToken = settings.format === 'yyyy-seq'
    ? String(date.getFullYear())
    : String(date.getFullYear()).slice(-2)
  const prefixParts = [settings.prefix, yearToken].filter(Boolean)
  const numberPrefix = prefixParts.join(settings.separator)
  const escapedPrefix = numberPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedSeparator = settings.separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escapedPrefix}${escapedSeparator}(\\d+)$`)
  const highestSequence = existingInvoices.reduce((highest, invoice) => {
    const match = invoice.invoice_number.match(pattern)
    if (!match) return highest
    return Math.max(highest, Number(match[1]) || 0)
  }, settings.resetAnnually ? settings.nextNumber - 1 : 0)

  return `${numberPrefix}${settings.separator}${String(highestSequence + 1).padStart(settings.digits, '0')}`
}

function getTaxRate(countryCode: TaxCountryCode, taxType: TaxType) {
  if (taxType === 'none') return 0

  const country = taxCountries.find((item) => item.code === countryCode) ?? taxCountries[0]
  return taxType === 'reduced' ? country.reducedRate : country.standardRate
}

function getVatOptions(countryCode: TaxCountryCode, t: (key: string) => string) {
  const standardRate = getTaxRate(countryCode, 'standard')
  const reducedRate = getTaxRate(countryCode, 'reduced')

  return [
    { value: String(standardRate), label: `${t('invoices.standardVat')} (${standardRate}%)` },
    { value: String(reducedRate), label: `${t('invoices.reducedVat')} (${reducedRate}%)` },
    { value: '0', label: `${t('invoices.noVat')} (0%)` },
  ]
}

function getClientAddressLines(client: ClientOption | null | undefined) {
  if (!client) return []
  const streetLine = [client.street, client.house_number].filter(Boolean).join(' ')
  const cityLine = [client.postal_code, client.city].filter(Boolean).join(' ')

  return [streetLine, cityLine, client.country].filter(Boolean)
}

export default function InvoicesPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const intlLocale = getIntlLocale(locale)
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [quickClient, setQuickClient] = useState({ name: '', phone: '', interested_in: '' })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null)
  const [printingInvoice, setPrintingInvoice] = useState<InvoiceRecord | null>(null)
  const [combinedPrintInvoices, setCombinedPrintInvoices] = useState<InvoiceRecord[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [deleteInvoice, setDeleteInvoice] = useState<InvoiceRecord | null>(null)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [companyIban, setCompanyIban] = useState('')
  const [companyBic, setCompanyBic] = useState('')
  const [companyTaxNumber, setCompanyTaxNumber] = useState('')
  const [includeCompanyAddress, setIncludeCompanyAddress] = useState(true)
  const [supportsClientDetails, setSupportsClientDetails] = useState(true)
  const [clientPrintFields, setClientPrintFields] = useState<InvoiceClientPrintFields>(defaultClientPrintFields)
  const [formData, setFormData] = useState<InvoiceFormState>({
    client_id: '',
    invoice_number: makeInvoiceNumber(),
    issue_date: today(),
    due_date: '',
    currency: 'USD',
    status: 'sent',
    notes: '',
    tax_country: 'DE',
    tax_type: 'standard',
    payment_method: 'card',
    amount_paid: '',
    items: [newItem()],
  })

  const selectedInvoices = useMemo(
    () => invoices.filter((invoice) => selectedInvoiceIds.has(invoice.id)),
    [invoices, selectedInvoiceIds]
  )

  const allInvoicesSelected = invoices.length > 0 && invoices.every((invoice) => selectedInvoiceIds.has(invoice.id))
  const combinedCurrency = useMemo(() => {
    if (combinedPrintInvoices.length === 0) return null
    const [first] = combinedPrintInvoices
    return combinedPrintInvoices.every((invoice) => invoice.currency === first.currency) ? first.currency : null
  }, [combinedPrintInvoices])
  const combinedTotals = useMemo(() => ({
    subtotal: combinedPrintInvoices.reduce((sum, invoice) => sum + Number(invoice.subtotal || 0), 0),
    tax: combinedPrintInvoices.reduce((sum, invoice) => sum + Number(invoice.tax_amount || 0), 0),
    total: combinedPrintInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0),
  }), [combinedPrintInvoices])
  const combinedClient = useMemo(() => {
    if (combinedPrintInvoices.length === 0) return null
    const firstClientId = combinedPrintInvoices[0].client_id
    return combinedPrintInvoices.every((invoice) => invoice.client_id === firstClientId)
      ? combinedPrintInvoices[0].clients ?? null
      : null
  }, [combinedPrintInvoices])
  const hasMixedCombinedClients = combinedPrintInvoices.length > 1 && !combinedClient

  const calculated = useMemo(() => calculateItems(formData.items), [formData.items])
  const vatOptions = useMemo(() => getVatOptions(formData.tax_country, t), [formData.tax_country, t])

  useEffect(() => {
    if (!currentCompany) return
    const branding = loadCompanyBranding(currentCompany.id)
    setCompanyLogo(branding.logo)
    setCompanyAddress(branding.address)
    setCompanyEmail(branding.email)
    setCompanyIban(branding.iban)
    setCompanyBic(branding.bic)
    setCompanyTaxNumber(branding.taxNumber)
    setIncludeCompanyAddress(window.localStorage.getItem(`leonety-include-company-address:${currentCompany.id}`) !== 'false')
    setClientPrintFields(loadClientPrintFields(currentCompany.id))
  }, [currentCompany])

  const handleIncludeCompanyAddressChange = (checked: boolean) => {
    setIncludeCompanyAddress(checked)
    if (currentCompany) {
      window.localStorage.setItem(`leonety-include-company-address:${currentCompany.id}`, String(checked))
    }
  }

  const handleClientPrintFieldChange = (field: keyof InvoiceClientPrintFields, checked: boolean) => {
    setClientPrintFields((current) => {
      const next = { ...current, [field]: checked }
      if (currentCompany) {
        saveClientPrintFields(currentCompany.id, next)
      }
      return next
    })
  }

  const resetForm = useCallback(() => {
    const defaultTaxRate = getTaxRate('DE', 'standard')
    setEditingInvoice(null)
    setFormData({
      client_id: '',
      invoice_number: makeInvoiceNumber(invoices),
      issue_date: today(),
      due_date: '',
      currency: normalizeCurrencyCode(currentCompany?.currency ?? 'USD'),
      status: 'sent',
      notes: '',
      tax_country: 'DE',
      tax_type: 'standard',
      payment_method: 'card',
      amount_paid: '',
      items: [newItem(defaultTaxRate)],
    })
    setShowForm(false)
    setQuickClient({ name: '', phone: '', interested_in: '' })
  }, [currentCompany, invoices])

  const openCreateForm = () => {
    const defaultTaxRate = getTaxRate('DE', 'standard')
    setEditingInvoice(null)
    setFormData({
      client_id: '',
      invoice_number: makeInvoiceNumber(invoices),
      issue_date: today(),
      due_date: '',
      currency: normalizeCurrencyCode(currentCompany?.currency ?? 'USD'),
      status: 'sent',
      notes: '',
      tax_country: 'DE',
      tax_type: 'standard',
      payment_method: 'card',
      amount_paid: '',
      items: [newItem(defaultTaxRate)],
    })
    setQuickClient({ name: '', phone: '', interested_in: '' })
    setShowForm(true)
  }

  const loadInvoices = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')
      setFormData((prev) => ({ ...prev, currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD') }))

      const extendedInvoiceQuery = supabase
        .from('invoices')
        .select('*, clients(id, name, email, phone, client_company, street, house_number, postal_code, city, country, tax_number), invoice_items(*)')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
      const extendedClientQuery = supabase
        .from('clients')
        .select('id, name, email, phone, client_company, street, house_number, postal_code, city, country, tax_number')
        .eq('company_id', currentCompany.id)
        .order('name', { ascending: true })

      let [invoiceRes, clientRes]: Array<{
        data: unknown[] | null
        error: { code?: string; message?: string } | null
      }> = await Promise.all([
        extendedInvoiceQuery,
        extendedClientQuery,
      ])
      const productRes = await supabase
        .from('products')
        .select('id, name, sku, selling_price, currency, current_stock')
        .eq('company_id', currentCompany.id)
        .eq('status', 'active')
        .order('name', { ascending: true })

      if (
        (invoiceRes.error && ['42703', 'PGRST204', 'PGRST205'].includes(invoiceRes.error.code ?? '')) ||
        (clientRes.error && ['42703', 'PGRST204', 'PGRST205'].includes(clientRes.error.code ?? ''))
      ) {
        setSupportsClientDetails(false)
        ;[invoiceRes, clientRes] = await Promise.all([
          supabase
            .from('invoices')
            .select('*, clients(id, name, email, phone, client_company), invoice_items(*)')
            .eq('company_id', currentCompany.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('clients')
            .select('id, name, email, phone, client_company')
            .eq('company_id', currentCompany.id)
            .order('name', { ascending: true }),
        ])
      } else {
        setSupportsClientDetails(true)
      }

      if (invoiceRes.error) throw invoiceRes.error
      if (clientRes.error) throw clientRes.error
      if (productRes.error && !['42P01', 'PGRST205'].includes(productRes.error.code ?? '')) throw productRes.error

      setInvoices(((invoiceRes.data ?? []) as InvoiceRecord[]).map((invoice) => ({
        ...invoice,
        clients: invoice.clients
          ? {
            ...invoice.clients,
            street: invoice.clients.street ?? null,
            house_number: invoice.clients.house_number ?? null,
            postal_code: invoice.clients.postal_code ?? null,
            city: invoice.clients.city ?? null,
            country: invoice.clients.country ?? null,
            tax_number: invoice.clients.tax_number ?? null,
          }
          : null,
        subtotal: Number(invoice.subtotal),
        tax_amount: Number(invoice.tax_amount),
        total: Number(invoice.total),
        invoice_items: (invoice.invoice_items ?? []).map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          tax_rate: Number(item.tax_rate),
          line_total: Number(item.line_total),
        })),
      })))
      setClients(((clientRes.data ?? []) as ClientOption[]).map((client) => ({
        ...client,
        street: client.street ?? null,
        house_number: client.house_number ?? null,
        postal_code: client.postal_code ?? null,
        city: client.city ?? null,
        country: client.country ?? null,
        tax_number: client.tax_number ?? null,
      })))
      setProducts(((productRes.data ?? []) as ProductOption[]).map((product) => ({
        ...product,
        selling_price: product.selling_price === null ? null : Number(product.selling_price),
        current_stock: Number(product.current_stock),
      })))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  const updateItem = (index: number, updates: Partial<InvoiceItem>) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    }))
  }

  const removeItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const applyProductToItem = (index: number, productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return

    updateItem(index, {
      description: product.name,
      unit_price: Number(product.selling_price ?? 0),
    })
  }

  const handleEdit = (invoice: InvoiceRecord) => {
    const invoiceItems = invoice.invoice_items && invoice.invoice_items.length > 0
      ? invoice.invoice_items
      : [newItem(getTaxRate('DE', 'standard'))]
    setEditingInvoice(invoice)
    setFormData({
      client_id: invoice.client_id ?? '',
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date ?? '',
      currency: normalizeCurrencyCode(invoice.currency),
      status: invoice.status,
      notes: invoice.notes ?? '',
      tax_country: 'DE',
      tax_type: 'standard',
      payment_method: loadInvoicePaymentMeta(invoice.id).method,
      amount_paid: loadInvoicePaymentMeta(invoice.id).amountPaid,
      items: invoiceItems,
    })
    setShowForm(true)
  }

  const validateInvoice = () => {
    if (!formData.invoice_number.trim()) return 'Invoice number is required.'
    if (!formData.issue_date) return 'Issue date is required.'
    if (formData.items.some((item) => !item.description.trim())) return 'Each invoice item needs a description.'
    return ''
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!currentCompany) {
      setErrorMessage('Create or select a workspace first.')
      return
    }

    const validationError = validateInvoice()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    let clientId = formData.client_id || null

    if (!clientId && quickClient.name.trim()) {
      const { data: createdClient, error: clientCreateError } = await supabase
        .from('clients')
        .insert({
          company_id: currentCompany.id,
          name: quickClient.name.trim(),
          phone: quickClient.phone.trim() || null,
          interested_in: quickClient.interested_in.trim() || null,
          status: 'client',
        })
        .select('id')
        .single()

      if (clientCreateError) {
        setErrorMessage(clientCreateError.message)
        return
      }

      clientId = createdClient.id
      setClients((current) => [
        ...current,
        {
          id: createdClient.id,
          name: quickClient.name.trim(),
          phone: quickClient.phone.trim() || null,
          email: null,
          client_company: null,
          street: null,
          house_number: null,
          postal_code: null,
          city: null,
          country: null,
          tax_number: null,
        },
      ].sort((left, right) => left.name.localeCompare(right.name)))
    }

    const totals = calculateItems(formData.items)
    const invoicePayload = {
      company_id: currentCompany.id,
      client_id: clientId,
      invoice_number: formData.invoice_number.trim(),
      issue_date: formData.issue_date,
      due_date: formData.due_date || null,
      currency: normalizeCurrencyCode(formData.currency),
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total: totals.total,
      status: formData.status,
      notes: formData.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    try {
      let invoiceId = editingInvoice?.id

      if (editingInvoice) {
        const { error } = await supabase
          .from('invoices')
          .update(invoicePayload)
          .eq('id', editingInvoice.id)
          .eq('company_id', currentCompany.id)
        if (error) throw error

        const { error: deleteItemsError } = await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', editingInvoice.id)
        if (deleteItemsError) throw deleteItemsError
      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoicePayload)
          .select('id')
          .single()
        if (error) throw error
        invoiceId = data.id
      }

      const itemPayload = totals.items.map((item) => ({
        invoice_id: invoiceId,
        description: item.description.trim(),
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        line_total: item.line_total,
      }))

      const { error: itemError } = await supabase.from('invoice_items').insert(itemPayload)
      if (itemError) throw itemError

      if (invoiceId) {
        saveInvoicePaymentMeta(invoiceId, {
          method: formData.payment_method,
          amountPaid: formData.amount_paid.trim(),
        })
      }

      if (formData.status === 'paid') {
        const existingIncome = await supabase
          .from('incomes')
          .select('id')
          .eq('company_id', currentCompany.id)
          .eq('description', `Invoice ${formData.invoice_number.trim()} paid`)
          .maybeSingle()

        if (!existingIncome.error && !existingIncome.data) {
          const clientName = clients.find((client) => client.id === formData.client_id)?.name
          const itemNames = totals.items.map((item) => item.description.trim()).filter(Boolean).join(', ')
          const { error: incomeError } = await supabase.from('incomes').insert({
            company_id: currentCompany.id,
            description: `Invoice ${formData.invoice_number.trim()} paid`,
            category: 'Invoice Payment',
            amount: totals.total,
            currency: normalizeCurrencyCode(formData.currency),
            date: formData.issue_date,
          })

          if (incomeError) throw incomeError

          if (clientName || itemNames) {
            setMessage(`Invoice saved and income recorded for ${clientName || 'client'}${itemNames ? `: ${itemNames}` : ''}.`)
          }
        }
      }

      if (formData.status !== 'paid') {
        setMessage(editingInvoice ? 'Invoice updated.' : 'Invoice created.')
      }
      resetForm()
      await loadInvoices()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save invoice')
    }
  }

  const handleDelete = async (invoice: InvoiceRecord, keepIncome: boolean) => {
    if (!currentCompany) return

    try {
      if (!keepIncome) {
        const { error: incomeDeleteError } = await supabase
          .from('incomes')
          .delete()
          .eq('company_id', currentCompany.id)
          .eq('description', `Invoice ${invoice.invoice_number} paid`)

        if (incomeDeleteError) throw incomeDeleteError
      }

      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoice.id)
        .eq('company_id', currentCompany.id)

      if (error) throw error
      setMessage(keepIncome ? 'Invoice deleted. Related income was kept.' : 'Invoice and related income deleted.')
      setDeleteInvoice(null)
      await loadInvoices()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete invoice')
    }
  }

  const handlePrint = (invoice: InvoiceRecord) => {
    setPrintingInvoice(invoice)
    setCombinedPrintInvoices([])
    window.setTimeout(() => {
      const previousTitle = document.title
      document.title = ' '
      window.print()
      window.setTimeout(() => {
        document.title = previousTitle
      }, 500)
    }, 50)
  }

  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoiceIds((current) => {
      const next = new Set(current)
      if (next.has(invoiceId)) {
        next.delete(invoiceId)
      } else {
        next.add(invoiceId)
      }
      return next
    })
  }

  const toggleAllInvoices = () => {
    setSelectedInvoiceIds((current) => {
      if (invoices.length > 0 && invoices.every((invoice) => current.has(invoice.id))) {
        return new Set()
      }
      return new Set(invoices.map((invoice) => invoice.id))
    })
  }

  const handlePrintSelected = () => {
    if (selectedInvoices.length === 0) {
      setErrorMessage(t('invoices.selectAtLeastOne'))
      return
    }

    setPrintingInvoice(null)
    setCombinedPrintInvoices(selectedInvoices)
    window.setTimeout(() => {
      const previousTitle = document.title
      document.title = ' '
      window.print()
      window.setTimeout(() => {
        document.title = previousTitle
      }, 500)
    }, 50)
  }

  if (companyLoading || loading) {
    return (
      <PageContainer>
        <PageHeader title={t('invoices.title')} description={t('invoices.description')} />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title={t('invoices.title')} description={t('invoices.description')} />
        <EmptyState
          icon={Building2}
          title={t('common.noWorkspaceSelected')}
          description={t('dashboard.noWorkspace')}
          action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  if (currentCompany.type !== 'business') {
    return (
      <PageContainer>
        <PageHeader title={t('invoices.title')} description={t('invoices.description')} />
        <EmptyState
          icon={Building2}
          title={t('common.businessOnlyTitle')}
          description={t('common.businessOnlyDescription')}
          action={{ label: t('nav.workspaces'), onClick: () => router.push('/app/workspaces') }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('invoices.title')} description={`${t('invoices.description')} · ${currentCompany.name}`}>
        <Button onClick={() => showForm ? resetForm() : openCreateForm()}>
          <FileText className="h-4 w-4" />
          {showForm ? t('common.cancel') : t('invoices.add')}
        </Button>
      </PageHeader>

      {printingInvoice && (
        <div className="print-area print-invoice hidden">
          <div className="invoice-print-header">
            <div className="invoice-print-brand">
              {companyLogo ? (
                <Logo src={companyLogo} alt={currentCompany.name} size="print" className="invoice-print-logo" correctArtworkOffset={false} />
              ) : (
                <div className="invoice-print-logo-fallback flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-600">
                  {currentCompany.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="invoice-print-company">
                <h1 className="text-xl font-semibold">{currentCompany.name}</h1>
                <p className="text-sm text-slate-600">{printingInvoice.invoice_number}</p>
                {includeCompanyAddress && companyAddress && (
                  <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{companyAddress}</p>
                )}
                {includeCompanyAddress && companyEmail && (
                  <p className="text-xs text-slate-600">{companyEmail}</p>
                )}
                {includeCompanyAddress && companyTaxNumber && (
                  <p className="text-xs text-slate-600">{t('profile.companyTaxNumber')}: {companyTaxNumber}</p>
                )}
                {includeCompanyAddress && companyIban && (
                  <p className="text-xs text-slate-600">IBAN: {companyIban}</p>
                )}
                {includeCompanyAddress && companyBic && (
                  <p className="text-xs text-slate-600">BIC: {companyBic}</p>
                )}
              </div>
            </div>
            <div className="invoice-print-meta text-right text-sm">
              <p>{t('invoices.status')}: {formatInvoiceStatus(printingInvoice.status, t)}</p>
              <p>{t('invoices.issueDate')}: {new Date(`${printingInvoice.issue_date}T00:00:00`).toLocaleDateString(intlLocale)}</p>
              {printingInvoice.due_date && (
                <p>{t('invoices.dueDate')}: {new Date(`${printingInvoice.due_date}T00:00:00`).toLocaleDateString(intlLocale)}</p>
              )}
            </div>
          </div>
          <div className="invoice-print-client mb-3 rounded-md border p-3 text-sm">
            <p className="font-semibold">{t('invoices.client')}</p>
            <p>{printingInvoice.clients?.name ?? t('invoices.noClient')}</p>
            {clientPrintFields.company && printingInvoice.clients?.client_company && <p>{printingInvoice.clients.client_company}</p>}
            {clientPrintFields.email && printingInvoice.clients?.email && <p>{printingInvoice.clients.email}</p>}
            {clientPrintFields.phone && printingInvoice.clients?.phone && <p>{printingInvoice.clients.phone}</p>}
            {clientPrintFields.address && getClientAddressLines(printingInvoice.clients).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {clientPrintFields.taxNumber && printingInvoice.clients?.tax_number && (
              <p>{t('clients.taxNumber')}: {printingInvoice.clients.tax_number}</p>
            )}
            {printingInvoice.notes && <p className="mt-2 whitespace-pre-line text-slate-700">{printingInvoice.notes}</p>}
          </div>
          <table className="invoice-print-table w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border p-2 text-left">{t('common.description')}</th>
                <th className="border p-2 text-right">{t('invoices.quantity')}</th>
                <th className="border p-2 text-right">{t('invoices.price')}</th>
                <th className="border p-2 text-right">{t('invoices.tax')}</th>
                <th className="border p-2 text-right">{t('invoices.lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {(printingInvoice.invoice_items ?? []).map((item) => (
                <tr key={item.id ?? item.description}>
                  <td className="border p-2">{item.description}</td>
                  <td className="border p-2 text-right">{item.quantity}</td>
                  <td className="border p-2 text-right">{formatCurrency(item.unit_price, printingInvoice.currency, intlLocale)}</td>
                  <td className="border p-2 text-right">{item.tax_rate}%</td>
                  <td className="border p-2 text-right">{formatCurrency(item.line_total, printingInvoice.currency, intlLocale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="invoice-print-totals ml-auto mt-4 w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between"><span>{t('invoices.subtotal')}</span><span>{formatCurrency(printingInvoice.subtotal, printingInvoice.currency, intlLocale)}</span></div>
            <div className="flex justify-between"><span>{t('invoices.tax')}</span><span>{formatCurrency(printingInvoice.tax_amount, printingInvoice.currency, intlLocale)}</span></div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>{t('invoices.total')}</span><span>{formatCurrency(printingInvoice.total, printingInvoice.currency, intlLocale)}</span></div>
          </div>
          {printingInvoice.status === 'paid' && (
            <div className="invoice-print-payment mt-4 rounded-md border p-3 text-sm">
              <p className="font-semibold">{t('invoices.payment')}</p>
              <p>
                {t('invoices.paymentMethod')}: {loadInvoicePaymentMeta(printingInvoice.id).method === 'cash' ? t('invoices.paymentCash') : t('invoices.paymentCard')}
              </p>
              <p>
                {t('invoices.amountPaid')}: {formatCurrency(
                  Number(loadInvoicePaymentMeta(printingInvoice.id).amountPaid || printingInvoice.total),
                  printingInvoice.currency,
                  intlLocale
                )}
              </p>
              {includeCompanyAddress && loadInvoicePaymentMeta(printingInvoice.id).method === 'card' && companyIban && <p>IBAN: {companyIban}</p>}
              {includeCompanyAddress && loadInvoicePaymentMeta(printingInvoice.id).method === 'card' && companyBic && <p>BIC: {companyBic}</p>}
            </div>
          )}
        </div>
      )}

      {combinedPrintInvoices.length > 0 && (
        <div className="print-area print-invoice hidden">
          <div className="invoice-print-header">
            <div className="invoice-print-brand">
              {companyLogo ? (
                <Logo src={companyLogo} alt={currentCompany.name} size="print" className="invoice-print-logo" correctArtworkOffset={false} />
              ) : (
                <div className="invoice-print-logo-fallback flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-600">
                  {currentCompany.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="invoice-print-company">
                <h1 className="text-xl font-semibold">{currentCompany.name}</h1>
                <p className="text-sm text-slate-600">{t('invoices.combinedReport')}</p>
                {includeCompanyAddress && companyAddress && (
                  <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{companyAddress}</p>
                )}
                {includeCompanyAddress && companyEmail && (
                  <p className="text-xs text-slate-600">{companyEmail}</p>
                )}
              </div>
            </div>
            <div className="invoice-print-meta text-right text-sm">
              <p>{t('invoices.sourceInvoices')}: {combinedPrintInvoices.map((invoice) => invoice.invoice_number).join(', ')}</p>
              <p>{new Date().toLocaleDateString(intlLocale)}</p>
            </div>
          </div>
          {hasMixedCombinedClients ? (
            <div className="mb-3 rounded-md border p-3 text-sm">
              <p className="font-semibold">{t('invoices.multipleClients')}</p>
              <p>{t('invoices.mixedClientsReport')}</p>
            </div>
          ) : (
            <div className="mb-3 rounded-md border p-3 text-sm">
              <p className="font-semibold">{t('invoices.client')}</p>
              <p>{combinedClient?.name ?? t('invoices.noClient')}</p>
              {clientPrintFields.company && combinedClient?.client_company && <p>{combinedClient.client_company}</p>}
              {clientPrintFields.email && combinedClient?.email && <p>{combinedClient.email}</p>}
              {clientPrintFields.phone && combinedClient?.phone && <p>{combinedClient.phone}</p>}
              {clientPrintFields.address && getClientAddressLines(combinedClient).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
          {!combinedCurrency && (
            <div className="mb-3 rounded-md border p-3 text-sm">
              {t('invoices.mixedCurrenciesReport')}
            </div>
          )}
          <table className="invoice-print-table w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border p-2 text-left">{t('invoices.invoiceNumber')}</th>
                <th className="border p-2 text-left">{t('common.description')}</th>
                <th className="border p-2 text-right">{t('invoices.quantity')}</th>
                <th className="border p-2 text-right">{t('invoices.price')}</th>
                <th className="border p-2 text-right">{t('invoices.tax')}</th>
                <th className="border p-2 text-right">{t('invoices.lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {combinedPrintInvoices.flatMap((invoice) => (invoice.invoice_items ?? []).map((item) => (
                <tr key={`${invoice.id}-${item.id ?? item.description}`}>
                  <td className="border p-2">{invoice.invoice_number}</td>
                  <td className="border p-2">{item.description}</td>
                  <td className="border p-2 text-right">{item.quantity}</td>
                  <td className="border p-2 text-right">{formatCurrency(item.unit_price, invoice.currency, intlLocale)}</td>
                  <td className="border p-2 text-right">{item.tax_rate}%</td>
                  <td className="border p-2 text-right">{formatCurrency(item.line_total, invoice.currency, intlLocale)}</td>
                </tr>
              )))}
            </tbody>
          </table>
          {combinedCurrency ? (
            <div className="invoice-print-totals ml-auto mt-4 w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between"><span>{t('invoices.subtotal')}</span><span>{formatCurrency(combinedTotals.subtotal, combinedCurrency, intlLocale)}</span></div>
              <div className="flex justify-between"><span>{t('invoices.tax')}</span><span>{formatCurrency(combinedTotals.tax, combinedCurrency, intlLocale)}</span></div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>{t('invoices.grandTotal')}</span><span>{formatCurrency(combinedTotals.total, combinedCurrency, intlLocale)}</span></div>
            </div>
          ) : (
            <div className="invoice-print-totals ml-auto mt-4 w-full max-w-md space-y-2 text-sm">
              {combinedPrintInvoices.map((invoice) => (
                <div key={invoice.id} className="flex justify-between">
                  <span>{invoice.invoice_number}</span>
                  <span>{formatCurrency(invoice.total, invoice.currency, intlLocale)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{message}</div>}
      {errorMessage && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{errorMessage}</div>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingInvoice ? t('invoices.edit') : t('invoices.add')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('invoices.client')}</span>
                  <AppSelect
                    value={formData.client_id}
                    onChange={(value) => setFormData({ ...formData, client_id: value })}
                    options={[
                      { value: '', label: t('invoices.noClient') },
                      ...clients.map((client) => ({ value: client.id, label: client.name })),
                    ]}
                  />
                </label>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                    <PackagePlus className="h-4 w-4" />
                    {t('invoices.quickClient')}
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      value={quickClient.name}
                      onChange={(event) => setQuickClient({ ...quickClient, name: event.target.value })}
                      className="rounded-md border bg-white px-3 py-2 text-sm"
                      placeholder={t('clients.name')}
                      disabled={Boolean(formData.client_id)}
                    />
                    <input
                      value={quickClient.phone}
                      onChange={(event) => setQuickClient({ ...quickClient, phone: event.target.value })}
                      className="rounded-md border bg-white px-3 py-2 text-sm"
                      placeholder={t('clients.phone')}
                      disabled={Boolean(formData.client_id)}
                    />
                    <input
                      value={quickClient.interested_in}
                      onChange={(event) => setQuickClient({ ...quickClient, interested_in: event.target.value })}
                      className="rounded-md border bg-white px-3 py-2 text-sm"
                      placeholder={t('clients.interestedIn')}
                      disabled={Boolean(formData.client_id)}
                    />
                  </div>
                </div>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('invoices.invoiceNumber')}</span>
                  <input value={formData.invoice_number} onChange={(event) => setFormData({ ...formData, invoice_number: event.target.value })} className="w-full rounded-md border px-3 py-2" required />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('invoices.status')}</span>
                  <AppSelect
                    value={formData.status}
                    onChange={(value) => setFormData({ ...formData, status: value as InvoiceStatus })}
                    options={visibleInvoiceStatuses.map((status) => ({ value: status, label: formatInvoiceStatus(status, t) }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('invoices.issueDate')}</span>
                  <input type="date" value={formData.issue_date} onChange={(event) => setFormData({ ...formData, issue_date: event.target.value })} className="w-full rounded-md border px-3 py-2" required />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('invoices.dueDate')}</span>
                  <input type="date" value={formData.due_date} onChange={(event) => setFormData({ ...formData, due_date: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('common.currency')}</span>
                  <AppSelect
                    value={formData.currency}
                    onChange={(value) => setFormData({ ...formData, currency: normalizeCurrencyCode(value) })}
                    options={currencyOptions.map((option) => ({ value: option.code, label: `${option.code} - ${option.label}` }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('invoices.taxCountry')}</span>
                  <AppSelect
                    value={formData.tax_country}
                    onChange={(value) => {
                      const nextCountry = value as TaxCountryCode
                      const nextRate = getTaxRate(nextCountry, 'standard')
                      setFormData({
                        ...formData,
                        tax_country: nextCountry,
                        items: formData.items.map((item) => ({
                          ...item,
                          tax_rate: item.tax_rate === 0 ? 0 : nextRate,
                        })),
                      })
                    }}
                    options={taxCountries.map((country) => ({ value: country.code, label: country.label }))}
                  />
                </label>
              </div>

              {formData.status === 'paid' && (
                <div className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('invoices.paymentMethod')}</span>
                    <AppSelect
                      value={formData.payment_method}
                      onChange={(value) => setFormData({ ...formData, payment_method: value === 'cash' ? 'cash' : 'card' })}
                      options={[
                        { value: 'card', label: t('invoices.paymentCard') },
                        { value: 'cash', label: t('invoices.paymentCash') },
                      ]}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('invoices.amountPaid')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.amount_paid}
                      onChange={(event) => setFormData({ ...formData, amount_paid: event.target.value })}
                      className="w-full rounded-md border bg-white px-3 py-2"
                      placeholder={String(calculated.total)}
                    />
                    {formData.payment_method === 'card' && companyIban && (
                      <p className="text-xs text-slate-500">IBAN: {companyIban}</p>
                    )}
                  </label>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{t('invoices.items')}</h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFormData({ ...formData, items: [...formData.items, newItem(getTaxRate(formData.tax_country, 'standard'))] })}>{t('invoices.addItem')}</Button>
                </div>
                {formData.items.map((item, index) => {
                  const normalizedLine = calculateItems([item]).items[0]
                  return (
                    <div key={index} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_150px_120px_170px_120px_auto]">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">{t('invoices.product')}</span>
                        {products.length > 0 && (
                          <AppSelect
                            value=""
                            onChange={(value) => applyProductToItem(index, value)}
                            options={[
                              { value: '', label: t('invoices.selectProduct'), disabled: true },
                              ...products.map((product) => ({
                                value: product.id,
                                label: `${product.name}${product.sku ? ` · ${product.sku}` : ''}`,
                              })),
                            ]}
                            ariaLabel={t('invoices.selectProduct')}
                          />
                        )}
                        <input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder={t('common.description')} required />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">{t('invoices.quantity')}</span>
                        <div className="flex overflow-hidden rounded-md border">
                          <button
                            type="button"
                            className="px-3 text-sm font-semibold hover:bg-slate-50"
                            onClick={() => updateItem(index, { quantity: Number((item.quantity + 1).toFixed(2)) })}
                            aria-label={t('invoices.increaseQuantity')}
                          >
                            +
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}
                            className="w-full border-x px-2 py-2 text-center text-sm"
                          />
                          <button
                            type="button"
                            className="px-3 text-sm font-semibold hover:bg-slate-50"
                            onClick={() => updateItem(index, { quantity: Math.max(0, Number((item.quantity - 1).toFixed(2))) })}
                            aria-label={t('invoices.decreaseQuantity')}
                          >
                            -
                          </button>
                        </div>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">{t('invoices.price')}</span>
                        <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder={t('invoices.price')} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">{t('invoices.vat')}</span>
                        <AppSelect
                          value={String(item.tax_rate)}
                          onChange={(value) => updateItem(index, { tax_rate: Number(value) })}
                          options={vatOptions}
                          ariaLabel={t('invoices.vat')}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">{t('invoices.lineTotal')}</span>
                        <div className="rounded-md bg-slate-50 px-3 py-2 text-right text-sm font-medium">{formatCurrency(normalizedLine.line_total, formData.currency)}</div>
                      </label>
                      <div className="flex items-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => removeItem(index)}>{t('invoices.remove')}</Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('invoices.clientDetailsForPrint')}</span>
                <textarea
                  value={formData.notes}
                  onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                  className="min-h-20 w-full rounded-md border px-3 py-2"
                  placeholder={t('invoices.clientDetailsPlaceholder')}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={includeCompanyAddress}
                  onChange={(event) => handleIncludeCompanyAddressChange(event.target.checked)}
                  className="h-4 w-4"
                />
                {t('invoices.includeCompanyAddress')}
              </label>

              <fieldset className="rounded-md border border-slate-200 p-3">
                <legend className="px-1 text-sm font-medium text-slate-700">{t('invoices.clientPrintFields')}</legend>
                {!supportsClientDetails && (
                  <p className="mb-2 text-xs text-amber-700">{t('clients.detailsMigrationRequired')}</p>
                )}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {([
                    ['company', 'invoices.includeClientCompany'],
                    ['email', 'invoices.includeClientEmail'],
                    ['phone', 'invoices.includeClientPhone'],
                    ['address', 'invoices.includeClientAddress'],
                    ['taxNumber', 'invoices.includeClientTaxNumber'],
                  ] as Array<[keyof InvoiceClientPrintFields, string]>).map(([field, labelKey]) => (
                    <label key={field} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={clientPrintFields[field]}
                        onChange={(event) => handleClientPrintFieldChange(field, event.target.checked)}
                        className="h-4 w-4"
                      />
                      {t(labelKey)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="ml-auto max-w-xs space-y-2 rounded-md border bg-slate-50 p-4 text-sm">
                <div className="flex justify-between"><span>{t('invoices.subtotal')}</span><span>{formatCurrency(calculated.subtotal, formData.currency)}</span></div>
                <div className="flex justify-between"><span>{t('invoices.tax')}</span><span>{formatCurrency(calculated.taxAmount, formData.currency)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>{t('invoices.total')}</span><span>{formatCurrency(calculated.total, formData.currency)}</span></div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">{editingInvoice ? t('common.saveChanges') : t('invoices.add')}</Button>
                <Button type="button" variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {invoices.length === 0 ? (
        <EmptyState title={t('invoices.noInvoices')} description={t('invoices.noInvoicesDescription')} />
      ) : (
        <div className="space-y-3">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={allInvoicesSelected} onChange={toggleAllInvoices} />
                {t('invoices.selectAll')}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500">{selectedInvoices.length} {t('invoices.selected')}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedInvoiceIds(new Set())} disabled={selectedInvoices.length === 0}>
                  {t('common.clear')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handlePrintSelected} disabled={selectedInvoices.length === 0}>
                  <Printer className="h-4 w-4" />
                  {t('invoices.exportSelectedPdf')}
                </Button>
              </div>
            </CardContent>
          </Card>
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedInvoiceIds.has(invoice.id)}
                    onChange={() => toggleInvoiceSelection(invoice.id)}
                    aria-label={t('invoices.selectInvoice')}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{invoice.invoice_number}</p>
                    <p className="text-sm text-slate-500">
                      {invoice.clients?.name ?? t('invoices.noClient')} · {invoice.issue_date}
                      {invoice.due_date ? ` · ${t('invoices.dueDate')} ${invoice.due_date}` : ''}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{formatInvoiceStatus(invoice.status, t)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-2 font-semibold">{formatCurrency(invoice.total, invoice.currency)}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => handlePrint(invoice)}>
                    <Printer className="h-4 w-4" />
                    {t('common.print')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(invoice)}>
                    <Edit className="h-4 w-4" />
                    {t('common.edit')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDeleteInvoice(invoice)}>
                    <Trash2 className="h-4 w-4" />
                    {t('common.delete')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {deleteInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">{t('common.confirmDelete')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t('invoices.deleteKeepIncome')}
            </p>
            <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setDeleteInvoice(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleDelete(deleteInvoice, true)}>
                {t('invoices.keepIncome')}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleDelete(deleteInvoice, false)}>
                {t('invoices.deleteWithIncome')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
