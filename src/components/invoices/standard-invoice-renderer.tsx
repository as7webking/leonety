import { Logo } from '@/components/logo'
import { formatCurrency } from '@/lib/currency'
import type { CurrencySymbolPosition } from '@/lib/currency'
import type { InvoiceDocumentModel, InvoiceDocumentPaymentMethod } from '@/lib/invoice-document'

interface StandardInvoiceRendererProps {
  model: InvoiceDocumentModel
  intlLocale: string
  t: (key: string) => string
  currencySymbolPosition?: CurrencySymbolPosition
  printTemplate?: 'business' | 'minimal'
}

function paymentMethodLabel(method: InvoiceDocumentPaymentMethod, t: (key: string) => string) {
  if (method === 'cash') return t('invoices.paymentCash')
  if (method === 'card') return t('invoices.paymentCard')
  return t('invoices.paymentBankTransfer')
}

function formatDocumentDate(value: string, intlLocale: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(intlLocale)
}

export function StandardInvoiceRenderer({ model, intlLocale, t, currencySymbolPosition = 'automatic', printTemplate = 'business' }: StandardInvoiceRendererProps) {
  const allocationLines = model.payment.allocations.map((payment, index) => (
    <p key={`${payment.method}-${index}`}>{paymentMethodLabel(payment.method, t)}: {formatCurrency(payment.amount, model.currency, intlLocale, currencySymbolPosition)}{payment.reference ? ` · ${payment.reference}` : ''}</p>
  ))

  return (
    <article className={`invoice-print-document invoice-print-template-${printTemplate}`}>
      <div className="invoice-print-header">
        <section className="invoice-print-client text-sm">
          <h1 className="mb-3 text-2xl font-semibold">{t('invoices.documentTitle')}</h1>
          <p className="font-semibold">{model.buyer.name || t('invoices.noClient')}</p>
          {model.buyer.visibleFields.company && model.buyer.company && <p>{model.buyer.company}</p>}
          {model.buyer.visibleFields.address && model.buyer.addressLines.map((line) => <p key={line}>{line}</p>)}
          {model.buyer.visibleFields.email && model.buyer.email && <p>{model.buyer.email}</p>}
          {model.buyer.visibleFields.phone && model.buyer.phone && <p>{model.buyer.phone}</p>}
          {model.buyer.visibleFields.taxNumber && model.buyer.taxNumber && <p>{t('contracts.party.taxNumber')}: {model.buyer.taxNumber}</p>}
          {model.buyer.visibleFields.vatId && model.buyer.vatId && <p>{t('contracts.party.vatId')}: {model.buyer.vatId}</p>}
        </section>

        <div className="invoice-print-brand">
          {model.seller.logo ? (
            <Logo src={model.seller.logo} alt={model.seller.name} size="print" className="invoice-print-logo" correctArtworkOffset={false} />
          ) : (
            <div className="invoice-print-logo-fallback flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-600">
              {model.seller.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="invoice-print-company">
            <h2 className="text-xl font-semibold">{model.seller.name}</h2>
            {model.seller.showDetails && model.seller.legalForm && <p className="text-xs text-slate-600">{model.seller.legalForm}</p>}
            {model.seller.showDetails && model.seller.address && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{model.seller.address}</p>}
            {model.seller.showDetails && model.seller.email && <p className="text-xs text-slate-600">{model.seller.email}</p>}
            {model.seller.showDetails && model.seller.phone && <p className="text-xs text-slate-600">{model.seller.phone}</p>}
            {model.seller.showDetails && model.seller.taxNumber && <p className="text-xs text-slate-600">{t('contracts.party.taxNumber')}: {model.seller.taxNumber}</p>}
            {model.seller.showDetails && model.seller.vatId && <p className="text-xs text-slate-600">{t('workspaceLegal.vatId')}: {model.seller.vatId}</p>}
            {model.seller.showDetails && model.seller.representative && <p className="text-xs text-slate-600">{t('workspaceLegal.representative')}: {model.seller.representative}</p>}
            {model.seller.showDetails && model.seller.commercialRegister && <p className="text-xs text-slate-600">{t('workspaceLegal.commercialRegister')}: {model.seller.commercialRegister}{model.seller.registrationNumber ? ` ${model.seller.registrationNumber}` : ''}</p>}
            {model.seller.showDetails && !model.seller.commercialRegister && model.seller.registrationNumber && <p className="text-xs text-slate-600">{t('workspaceLegal.commercialRegister')}: {model.seller.registrationNumber}</p>}
            {model.seller.showDetails && model.seller.registerCourt && <p className="text-xs text-slate-600">{t('workspaceLegal.registerCourt')}: {model.seller.registerCourt}</p>}
            {model.seller.showDetails && model.seller.professionalRegulatoryInfo && <p className="whitespace-pre-line text-xs text-slate-600">{model.seller.professionalRegulatoryInfo}</p>}
            {model.seller.showDetails && model.seller.additionalLegalText && <p className="whitespace-pre-line text-xs text-slate-600">{model.seller.additionalLegalText}</p>}
          </div>
        </div>
      </div>

      <div className="invoice-print-meta text-sm">
        <strong>{model.invoiceNumber}</strong>
        <span>{t('invoices.issueDate')}: {formatDocumentDate(model.issueDate, intlLocale)}</span>
        {model.dueDate && <span>{t('invoices.dueDate')}: {formatDocumentDate(model.dueDate, intlLocale)}</span>}
        <span>{t('invoices.status')}: {t(`invoices.status.${model.status}`)}</span>
      </div>

      <table className="invoice-print-table w-full border-collapse text-sm">
        <thead><tr><th className="border p-2 text-left">{t('common.description')}</th><th className="border p-2 text-right">{t('invoices.quantity')}</th><th className="border p-2 text-right">{t('invoices.price')}</th><th className="border p-2 text-right">{t('invoices.tax')}</th><th className="border p-2 text-right">{t('invoices.lineTotal')}</th></tr></thead>
        <tbody>{model.items.map((item, index) => <tr key={item.id ?? `${item.description}-${index}`}><td className="invoice-print-description border p-2">{item.description}</td><td className="border p-2 text-right">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td><td className="border p-2 text-right">{formatCurrency(item.unitPrice, model.currency, intlLocale, currencySymbolPosition)}</td><td className="border p-2 text-right">{item.taxRate}%</td><td className="border p-2 text-right">{formatCurrency(item.lineTotal, model.currency, intlLocale, currencySymbolPosition)}</td></tr>)}</tbody>
      </table>

      {model.paymentTerms && <section className="invoice-print-payment-terms mt-4 whitespace-pre-line text-sm"><h2 className="font-semibold">{t('invoiceSettings.paymentTerms')}</h2><p>{model.paymentTerms}</p></section>}

      {model.notes && <section className="invoice-print-notes mt-4 whitespace-pre-line text-sm"><p>{t('clients.notes')}: {model.notes}</p></section>}

      <div className="invoice-print-totals ml-auto mt-4 w-full max-w-xs space-y-2 text-sm">
        <div className="flex justify-between"><span>{t('invoices.subtotal')}</span><span>{formatCurrency(model.totals.subtotal, model.currency, intlLocale, currencySymbolPosition)}</span></div>
        <div className="flex justify-between"><span>{t('invoices.tax')}</span><span>{formatCurrency(model.totals.taxAmount, model.currency, intlLocale, currencySymbolPosition)}</span></div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>{t('invoices.total')}</span><span>{formatCurrency(model.totals.total, model.currency, intlLocale, currencySymbolPosition)}</span></div>
      </div>

      {model.payment.isPaid && (
        <div className="invoice-print-payment mt-4 rounded-md border p-3 text-sm">
          <p className="font-semibold">{t('invoices.payment')}</p>
          {model.payment.splitPayment && model.payment.allocations.length > 0
            ? model.payment.groupAllocations ? <div className="mt-1 space-y-1">{allocationLines}</div> : allocationLines
            : <><p>{t('invoices.paymentMethod')}: {paymentMethodLabel(model.payment.method, t)}</p><p>{t('invoices.amountPaid')}: {formatCurrency(model.payment.amountPaid, model.currency, intlLocale, currencySymbolPosition)}</p></>}
        </div>
      )}

      {model.seller.showDetails && model.seller.iban && <footer className="invoice-print-footer"><div className="invoice-print-footer-legal"><p><strong>IBAN:</strong> {model.seller.iban}</p></div></footer>}
    </article>
  )
}
