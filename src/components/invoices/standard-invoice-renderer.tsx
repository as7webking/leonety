import { Logo } from '@/components/logo'
import { formatCurrency } from '@/lib/currency'
import type { InvoiceDocumentModel, InvoiceDocumentPaymentMethod } from '@/lib/invoice-document'

interface StandardInvoiceRendererProps {
  model: InvoiceDocumentModel
  intlLocale: string
  t: (key: string) => string
}

function paymentMethodLabel(method: InvoiceDocumentPaymentMethod, t: (key: string) => string) {
  if (method === 'cash') return t('invoices.paymentCash')
  if (method === 'card') return t('invoices.paymentCard')
  return t('invoices.paymentBankTransfer')
}

function formatDocumentDate(value: string, intlLocale: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(intlLocale)
}

export function StandardInvoiceRenderer({ model, intlLocale, t }: StandardInvoiceRendererProps) {
  const allocationLines = model.payment.allocations.map((payment, index) => (
    <p key={`${payment.method}-${index}`}>{paymentMethodLabel(payment.method, t)}: {formatCurrency(payment.amount, model.currency, intlLocale)}{payment.reference ? ` · ${payment.reference}` : ''}</p>
  ))

  return (
    <article className="invoice-print-document">
      <div className="invoice-print-header">
        <div className="invoice-print-brand">
          {model.seller.logo ? (
            <Logo src={model.seller.logo} alt={model.seller.name} size="print" className="invoice-print-logo" correctArtworkOffset={false} />
          ) : (
            <div className="invoice-print-logo-fallback flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-600">
              {model.seller.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="invoice-print-company">
            <h1 className="text-xl font-semibold">{model.seller.name}</h1>
            <p className="text-sm text-slate-600">{model.invoiceNumber}</p>
            {model.seller.showDetails && model.seller.address && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{model.seller.address}</p>}
            {model.seller.showDetails && model.seller.email && <p className="text-xs text-slate-600">{model.seller.email}</p>}
            {model.seller.showDetails && model.seller.taxNumber && <p className="text-xs text-slate-600">{t('profile.companyTaxNumber')}: {model.seller.taxNumber}</p>}
            {model.seller.showDetails && model.seller.iban && <p className="text-xs text-slate-600">IBAN: {model.seller.iban}</p>}
            {model.seller.showDetails && model.seller.bic && <p className="text-xs text-slate-600">BIC: {model.seller.bic}</p>}
          </div>
        </div>
        <div className="invoice-print-meta text-right text-sm">
          <p>{t('invoices.status')}: {t(`invoices.status.${model.status}`)}</p>
          <p>{t('invoices.issueDate')}: {formatDocumentDate(model.issueDate, intlLocale)}</p>
          {model.dueDate && <p>{t('invoices.dueDate')}: {formatDocumentDate(model.dueDate, intlLocale)}</p>}
        </div>
      </div>

      <div className="invoice-print-client mb-3 rounded-md border p-3 text-sm">
        <p className="font-semibold">{t('invoices.client')}</p>
        <p>{model.buyer.name || t('invoices.noClient')}</p>
        {model.buyer.visibleFields.company && model.buyer.company && <p>{model.buyer.company}</p>}
        {model.buyer.visibleFields.email && model.buyer.email && <p>{model.buyer.email}</p>}
        {model.buyer.visibleFields.phone && model.buyer.phone && <p>{model.buyer.phone}</p>}
        {model.buyer.visibleFields.address && model.buyer.addressLines.map((line) => <p key={line}>{line}</p>)}
        {model.buyer.visibleFields.taxNumber && model.buyer.taxNumber && <p>{t('clients.taxNumber')}: {model.buyer.taxNumber}</p>}
        {model.notes && <p className="mt-2 whitespace-pre-line text-slate-700">{model.notes}</p>}
      </div>

      <table className="invoice-print-table w-full border-collapse text-sm">
        <thead><tr><th className="border p-2 text-left">{t('common.description')}</th><th className="border p-2 text-right">{t('invoices.quantity')}</th><th className="border p-2 text-right">{t('invoices.price')}</th><th className="border p-2 text-right">{t('invoices.tax')}</th><th className="border p-2 text-right">{t('invoices.lineTotal')}</th></tr></thead>
        <tbody>{model.items.map((item) => <tr key={item.id ?? item.description}><td className="border p-2">{item.description}</td><td className="border p-2 text-right">{item.quantity}</td><td className="border p-2 text-right">{formatCurrency(item.unitPrice, model.currency, intlLocale)}</td><td className="border p-2 text-right">{item.taxRate}%</td><td className="border p-2 text-right">{formatCurrency(item.lineTotal, model.currency, intlLocale)}</td></tr>)}</tbody>
      </table>

      <div className="invoice-print-totals ml-auto mt-4 w-full max-w-xs space-y-2 text-sm">
        <div className="flex justify-between"><span>{t('invoices.subtotal')}</span><span>{formatCurrency(model.totals.subtotal, model.currency, intlLocale)}</span></div>
        <div className="flex justify-between"><span>{t('invoices.tax')}</span><span>{formatCurrency(model.totals.taxAmount, model.currency, intlLocale)}</span></div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>{t('invoices.total')}</span><span>{formatCurrency(model.totals.total, model.currency, intlLocale)}</span></div>
      </div>

      {model.payment.isPaid && (
        <div className="invoice-print-payment mt-4 rounded-md border p-3 text-sm">
          <p className="font-semibold">{t('invoices.payment')}</p>
          {model.payment.splitPayment && model.payment.allocations.length > 0
            ? model.payment.groupAllocations ? <div className="mt-1 space-y-1">{allocationLines}</div> : allocationLines
            : <><p>{t('invoices.paymentMethod')}: {paymentMethodLabel(model.payment.method, t)}</p><p>{t('invoices.amountPaid')}: {formatCurrency(model.payment.amountPaid, model.currency, intlLocale)}</p></>}
          {model.payment.repeatBankDetails && model.seller.showDetails && model.payment.method === 'bank_transfer' && model.seller.iban && <p>IBAN: {model.seller.iban}</p>}
          {model.payment.repeatBankDetails && model.seller.showDetails && model.payment.method === 'bank_transfer' && model.seller.bic && <p>BIC: {model.seller.bic}</p>}
        </div>
      )}
    </article>
  )
}
