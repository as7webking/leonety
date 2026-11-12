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

export interface InvoiceIssuerProfile {
  name: string
  email: string
}

export function estimateInvoicePageCount(documentHeights: number[], printablePageHeight: number): number {
  if (!Number.isFinite(printablePageHeight) || printablePageHeight <= 0) return 0
  return documentHeights.reduce((pages, height) => {
    if (!Number.isFinite(height) || height <= 0) return pages
    return pages + Math.max(1, Math.ceil(height / printablePageHeight))
  }, 0)
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
  issuerProfile?: InvoiceIssuerProfile | null
  showIssuer?: boolean
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
    visibleFields?: { taxNumber: boolean; vatId: boolean }
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
  | {
    schemaVersion: 3
    issuerProfile: InvoiceIssuerProfile | null
    items: InvoiceDocumentItem[]
    totals: InvoiceDocumentModel['totals']
    payment: InvoiceDocumentModel['payment']
    paymentTerms: string | null
  }
  | {
    schemaVersion: 4
    issuerProfile: InvoiceIssuerProfile | null
    showIssuer: boolean
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
  issuerProfile?: InvoiceIssuerProfile | null
  showIssuer?: boolean
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
  const hasFullSnapshot = snapshot?.schemaVersion === 2 || snapshot?.schemaVersion === 3 || snapshot?.schemaVersion === 4
  const seller = {
    ...(snapshotSeller ?? presentation.seller),
    // Older issued invoices may predate saved bank details; only an empty IBAN falls back to the current workspace profile.
    iban: snapshotSeller?.iban?.trim() ? snapshotSeller.iban : presentation.seller.iban,
    // This is a current print preference, not historical invoice data.
    showDetails: presentation.seller.showDetails,
    visibleFields: {
      taxNumber: presentation.seller.visibleFields?.taxNumber ?? true,
      vatId: presentation.seller.visibleFields?.vatId ?? true,
    },
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
    paymentTerms: hasFullSnapshot ? snapshot.paymentTerms ?? null : presentation.paymentTerms ?? null,
    issuerProfile: snapshot?.schemaVersion === 3 || snapshot?.schemaVersion === 4 ? snapshot.issuerProfile : presentation.issuerProfile,
    showIssuer: presentation.showIssuer ?? (snapshot?.schemaVersion === 4 ? snapshot.showIssuer : true),
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
      visibleFields: {
        ...presentation.buyerVisibleFields,
        vatId: presentation.buyerVisibleFields.vatId ?? presentation.buyerVisibleFields.taxNumber,
      },
    },
    items: hasFullSnapshot ? snapshot.items.map((item) => ({ ...item })) : (invoice.invoice_items ?? []).map((item) => ({
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
      subtotal: hasFullSnapshot ? snapshot.totals.subtotal : invoice.subtotal,
      taxAmount: hasFullSnapshot ? snapshot.totals.taxAmount : invoice.tax_amount,
      total: hasFullSnapshot ? snapshot.totals.total : invoice.total,
    },
    payment: {
      ...(hasFullSnapshot ? snapshot.payment : presentation.payment),
      allocations: (hasFullSnapshot ? snapshot.payment.allocations : presentation.payment.allocations).map((allocation) => ({ ...allocation })),
      isPaid: invoice.status === 'paid',
    },
  }
}

export function createInvoiceDocumentSnapshot(
  model: InvoiceDocumentModel,
  capturedAt: string,
): InvoiceDocumentSnapshot {
  // Version 4 stores independent print visibility for seller, issuer and tax identifiers.
  const seller = model.seller.showDetails
    ? {
      ...model.seller,
      taxNumber: model.seller.visibleFields?.taxNumber === false ? '' : model.seller.taxNumber,
      vatId: model.seller.visibleFields?.vatId === false ? '' : model.seller.vatId ?? '',
    }
    : {
      ...model.seller,
      legalForm: '', address: '', email: '', taxNumber: '', vatId: '', phone: '',
      representative: '', commercialRegister: '', registerCourt: '', registrationNumber: '',
      professionalRegulatoryInfo: '', additionalLegalText: '', iban: '', bic: '',
      accountHolder: '', bankName: '',
    }
  const buyer = model.buyer
  return {
    schemaVersion: 4,
    capturedAt,
    templateId: model.templateId,
    seller,
    issuerProfile: model.showIssuer === false ? null : model.issuerProfile ?? null,
    showIssuer: model.showIssuer !== false,
    buyer: {
      ...buyer,
      company: buyer.visibleFields.company ? buyer.company : null,
      email: buyer.visibleFields.email ? buyer.email : null,
      phone: buyer.visibleFields.phone ? buyer.phone : null,
      taxNumber: buyer.visibleFields.taxNumber ? buyer.taxNumber : null,
      vatId: buyer.visibleFields.vatId ? buyer.vatId ?? null : null,
      addressLines: [...buyer.addressLines],
      visibleFields: { ...buyer.visibleFields },
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
