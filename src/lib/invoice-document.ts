export type InvoiceDocumentStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type InvoiceDocumentPaymentMethod = 'cash' | 'bank_transfer' | 'card'

export interface InvoiceDocumentItem {
  id?: string
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  lineTotal: number
}

export interface InvoiceDocumentPaymentAllocation {
  method: InvoiceDocumentPaymentMethod
  amount: number
  reference: string | null
}

export interface InvoiceDocumentModel {
  id: string
  templateId: 'standard'
  invoiceNumber: string
  status: InvoiceDocumentStatus
  issueDate: string
  dueDate: string | null
  currency: string
  notes: string | null
  seller: {
    name: string
    logo: string
    address: string
    email: string
    taxNumber: string
    iban: string
    bic: string
    showDetails: boolean
  }
  buyer: {
    name: string
    company: string | null
    email: string | null
    phone: string | null
    addressLines: string[]
    taxNumber: string | null
    visibleFields: {
      company: boolean
      email: boolean
      phone: boolean
      address: boolean
      taxNumber: boolean
    }
  }
  items: InvoiceDocumentItem[]
  totals: {
    subtotal: number
    taxAmount: number
    total: number
  }
  payment: {
    isPaid: boolean
    method: InvoiceDocumentPaymentMethod
    amountPaid: number
    splitPayment: boolean
    allocations: InvoiceDocumentPaymentAllocation[]
    groupAllocations: boolean
    repeatBankDetails: boolean
  }
}

export interface InvoiceDocumentSnapshot {
  schemaVersion: 1
  capturedAt: string
  templateId: 'standard'
  seller: InvoiceDocumentModel['seller']
  buyer: InvoiceDocumentModel['buyer']
}

interface InvoiceDocumentSource {
  id: string
  invoice_number: string
  status: InvoiceDocumentStatus
  issue_date: string
  due_date: string | null
  currency: string
  notes: string | null
  subtotal: number
  tax_amount: number
  total: number
  document_snapshot?: InvoiceDocumentSnapshot | null
  invoice_items?: Array<{
    id?: string
    description: string
    quantity: number
    unit_price: number
    tax_rate: number
    line_total: number
  }>
  clients?: {
    name: string
    client_company: string | null
    email: string | null
    phone: string | null
    tax_number: string | null
    street?: string | null
    house_number?: string | null
    postal_code?: string | null
    city?: string | null
    country?: string | null
  } | null
}

interface InvoiceDocumentPresentation {
  seller: InvoiceDocumentModel['seller']
  buyerAddressLines: string[]
  buyerVisibleFields: InvoiceDocumentModel['buyer']['visibleFields']
  payment: Omit<InvoiceDocumentModel['payment'], 'isPaid'>
}

export function createInvoiceDocumentModel(
  invoice: InvoiceDocumentSource,
  presentation: InvoiceDocumentPresentation,
): InvoiceDocumentModel {
  const snapshot = invoice.document_snapshot
  return {
    id: invoice.id,
    templateId: snapshot?.templateId ?? 'standard',
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    currency: invoice.currency,
    notes: invoice.notes,
    seller: { ...(snapshot?.seller ?? presentation.seller) },
    buyer: {
      ...(snapshot?.buyer ?? {
        name: invoice.clients?.name ?? '',
        company: invoice.clients?.client_company ?? null,
        email: invoice.clients?.email ?? null,
        phone: invoice.clients?.phone ?? null,
        addressLines: [...presentation.buyerAddressLines],
        taxNumber: invoice.clients?.tax_number ?? null,
        visibleFields: { ...presentation.buyerVisibleFields },
      }),
      addressLines: [...(snapshot?.buyer.addressLines ?? presentation.buyerAddressLines)],
      visibleFields: { ...(snapshot?.buyer.visibleFields ?? presentation.buyerVisibleFields) },
    },
    items: (invoice.invoice_items ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      taxRate: item.tax_rate,
      lineTotal: item.line_total,
    })),
    // These are canonical persisted invoice values. Renderers must never recalculate them.
    totals: {
      subtotal: invoice.subtotal,
      taxAmount: invoice.tax_amount,
      total: invoice.total,
    },
    payment: {
      ...presentation.payment,
      allocations: presentation.payment.allocations.map((allocation) => ({ ...allocation })),
      isPaid: invoice.status === 'paid',
    },
  }
}

export function createInvoiceDocumentSnapshot(
  model: InvoiceDocumentModel,
  capturedAt: string,
): InvoiceDocumentSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    templateId: model.templateId,
    seller: { ...model.seller },
    buyer: {
      ...model.buyer,
      addressLines: [...model.buyer.addressLines],
      visibleFields: { ...model.buyer.visibleFields },
    },
  }
}
