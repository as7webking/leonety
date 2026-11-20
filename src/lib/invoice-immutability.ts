export type InvoiceFinalizationState = {
  status: string
  document_snapshot?: unknown | null
  issued_at?: string | null
}

export function isInvoiceFinalized(invoice: InvoiceFinalizationState) {
  return invoice.status !== 'draft' || invoice.document_snapshot != null || invoice.issued_at != null
}

export function canEditInvoiceContent(invoice: InvoiceFinalizationState) {
  return !isInvoiceFinalized(invoice)
}

export function canDeleteInvoice(invoice: InvoiceFinalizationState) {
  return !isInvoiceFinalized(invoice)
}

export function shouldRecordInvoicePayments(currentStatus: string | null, nextStatus: string, isNew: boolean, existingFinalizedRetry = false) {
  return !existingFinalizedRetry && nextStatus === 'paid' && (isNew || currentStatus !== 'paid')
}

export function invoiceUpdateForFinalized(invoice: InvoiceFinalizationState, status: string, updatedAt: string) {
  if (!isInvoiceFinalized(invoice)) return null
  if (status === 'draft') return null
  return { status, updated_at: updatedAt }
}
