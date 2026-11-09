export type InvoiceDocumentStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type InvoiceDocumentPaymentMethod = 'cash' | 'bank_transfer' | 'card'

export interface InvoiceDocumentItem {
  id?: string
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  lineTotal: number
  unit?: string | null
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
  paymentTerms: string | null
  seller: {
    name: string
    legalForm?: string
    logo: string
    address: string
    email: string
    taxNumber: string
    vatId?: string
    phone?: string
    representative?: string
    commercialRegister?: string
    registerCourt?: string
    registrationNumber?: string
    professionalRegulatoryInfo?: string
    additionalLegalText?: string
    iban: string
    bic: string
    accountHolder?: string
    bankName?: string
    showDetails: boolean
  }
  buyer: {
    name: string
    company: string | null
    email: string | null
    phone: string | null
    addressLines: string[]
    taxNumber: string | null
    vatId?: string | null
    visibleFields: {
      company: boolean
      email: boolean
      phone: boolean
      address: boolean
      taxNumber: boolean
      vatId?: boolean
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

type InvoiceDocumentSnapshotBase = {
  capturedAt: string
  templateId: 'standard'
  seller: InvoiceDocumentModel['seller']
  buyer: InvoiceDocumentModel['buyer']
}

export type InvoiceDocumentSnapshot = InvoiceDocumentSnapshotBase & (
  | { schemaVersion: 1 }
  | {
    schemaVersion: 2
    items: InvoiceDocumentItem[]
    totals: InvoiceDocumentModel['totals']
    payment: InvoiceDocumentModel['payment']
    paymentTerms: string | null
  }
)

interface InvoiceDocumentSource {
  id: string
  invoice_number: string
  status: InvoiceDocumentStatus
  issue_date: string
  due_date: string | null
  currency: string
  notes: string | null
  payment_terms?: string | null
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
    unit?: string | null
  }>
  clients?: {
    name: string
    client_company: string | null
    email: string | null
    phone: string | null
    tax_number: string | null
    vat_id?: string | null
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
  paymentTerms?: string | null
}

export function createInvoiceDocumentModel(
  invoice: InvoiceDocumentSource,
  presentation: InvoiceDocumentPresentation,
): InvoiceDocumentModel {
  const snapshot = invoice.document_snapshot
  const snapshotSeller = snapshot?.seller
  const seller = {
    ...(snapshotSeller ?? presentation.seller),
    // This is a current print preference, not historical invoice data.
    showDetails: presentation.seller.showDetails,
  }

  return {
    id: invoice.id,
    templateId: snapshot?.templateId ?? 'standard',
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    currency: invoice.currency,
    notes: invoice.notes,
    paymentTerms: snapshot?.schemaVersion === 2
      ? snapshot.paymentTerms ?? null
      : presentation.paymentTerms ?? null,
    seller,
    buyer: {
      ...(snapshot?.buyer ?? {
        name: invoice.clients?.name ?? '',
        company: invoice.clients?.client_company ?? null,
        email: invoice.clients?.email ?? null,
        phone: invoice.clients?.phone ?? null,
        addressLines: [...presentation.buyerAddressLines],
        taxNumber: invoice.clients?.tax_number ?? null,
        vatId: invoice.clients?.vat_id ?? null,
        visibleFields: { ...presentation.buyerVisibleFields },
      }),
      addressLines: [...(snapshot?.buyer.addressLines ?? presentation.buyerAddressLines)],
      visibleFields: { ...(snapshot?.buyer.visibleFields ?? presentation.buyerVisibleFields) },
    },
    items: snapshot?.schemaVersion === 2 ? snapshot.items.map((item) => ({ ...item })) : (invoice.invoice_items ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      taxRate: item.tax_rate,
      lineTotal: item.line_total,
      unit: item.unit ?? null,
    })),
    // These are canonical persisted invoice values. Renderers must never recalculate them.
    totals: {
      subtotal: snapshot?.schemaVersion === 2 ? snapshot.totals.subtotal : invoice.subtotal,
      taxAmount: snapshot?.schemaVersion === 2 ? snapshot.totals.taxAmount : invoice.tax_amount,
      total: snapshot?.schemaVersion === 2 ? snapshot.totals.total : invoice.total,
    },
    payment: {
      ...(snapshot?.schemaVersion === 2 ? snapshot.payment : presentation.payment),
      allocations: (snapshot?.schemaVersion === 2 ? snapshot.payment.allocations : presentation.payment.allocations).map((allocation) => ({ ...allocation })),
      isPaid: invoice.status === 'paid',
    },
  }
}

export function createInvoiceDocumentSnapshot(
  model: InvoiceDocumentModel,
  capturedAt: string,
): InvoiceDocumentSnapshot {
  return {
    schemaVersion: 2,
    capturedAt,
    templateId: model.templateId,
    seller: { ...model.seller },
    buyer: {
      ...model.buyer,
      addressLines: [...model.buyer.addressLines],
      visibleFields: { ...model.buyer.visibleFields },
    },
    items: model.items.map((item) => ({ ...item })),
    totals: { ...model.totals },
    payment: {
      ...model.payment,
      allocations: model.payment.allocations.map((allocation) => ({ ...allocation })),
    },
    paymentTerms: model.paymentTerms,
  }
}
