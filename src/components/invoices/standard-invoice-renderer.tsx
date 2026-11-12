import { Logo } from '@/components/logo'
import { formatCurrency } from '@/lib/currency'
import type { CurrencySymbolPosition } from '@/lib/currency'
import type { InvoiceDocumentModel, InvoiceDocumentPaymentMethod } from '@/lib/invoice-document'

interface StandardInvoiceRendererProps {
  model: InvoiceDocumentModel
  issuerProfile?: { name: string; email: string }
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

export function StandardInvoiceRenderer({ model, issuerProfile, intlLocale, t, currencySymbolPosition = 'automatic', printTemplate = 'business' }: StandardInvoiceRendererProps) {
  const issuer = model.issuerProfile === undefined ? issuerProfile : model.issuerProfile
  const allocationLines = model.payment.allocations.map((payment, index) => (
    <p key={`${payment.method}-${index}`}>{paymentMethodLabel(payment.method, t)}: {formatCurrency(payment.amount, model.currency, intlLocale, currencySymbolPosition)}{payment.reference ? ` · ${payment.reference}` : ''}</p>
  ))

  return (
    <article className={`invoice-print-document invoice-print-template-${printTemplate}`}>
      <div className="invoice-print-header">
        <h1 className="invoice-print-title text-2xl font-semibold">{t('invoices.documentTitle')}</h1>
        {(model.showIssuer || model.seller.showDetails) && (
          <aside className="invoice-print-issuer text-sm">
            {model.showIssuer && issuer?.name && <p className="font-semibold">{issuer.name}</p>}
            {model.showIssuer && issuer?.email && <p className="break-all text-xs">{issuer.email}</p>}
            {model.seller.showDetails && <>
              {model.seller.logo && <Logo src={model.seller.logo} alt={model.seller.name} size="print" className="invoice-print-logo" correctArtworkOffset={false} />}
              <p className="invoice-print-seller-name">{model.seller.name}</p>
              {model.seller.legalForm && <p>{model.seller.legalForm}</p>}
              {model.seller.address && <p className="whitespace-pre-line">{model.seller.address}</p>}
              {model.seller.email !== issuer?.email && model.seller.email && <p>{t('contracts.party.email')}: {model.seller.email}</p>}
              {model.seller.phone && <p>{t('contracts.party.phone')}: {model.seller.phone}</p>}
              {model.seller.visibleFields?.taxNumber !== false && <p>{t('contracts.party.taxNumber')}: {model.seller.taxNumber ?? ''}</p>}
              {model.seller.visibleFields?.vatId !== false && <p>{t('contracts.party.vatId')}: {model.seller.vatId ?? ''}</p>}
              {model.seller.representative && <p>{t('workspaceLegal.representative')}: {model.seller.representative}</p>}
              {model.seller.commercialRegister && <p>{t('workspaceLegal.commercialRegister')}: {model.seller.commercialRegister}{model.seller.registrationNumber ? ` ${model.seller.registrationNumber}` : ''}</p>}
              {!model.seller.commercialRegister && model.seller.registrationNumber && <p>{t('workspaceLegal.commercialRegister')}: {model.seller.registrationNumber}</p>}
              {model.seller.registerCourt && <p>{t('workspaceLegal.registerCourt')}: {model.seller.registerCourt}</p>}
              {model.seller.professionalRegulatoryInfo && <p className="whitespace-pre-line">{model.seller.professionalRegulatoryInfo}</p>}
              {model.seller.additionalLegalText && <p className="whitespace-pre-line">{model.seller.additionalLegalText}</p>}
            </>}
          </aside>
        )}
      </div>

      <section className="invoice-print-client text-sm">
        <p className="invoice-print-buyer-label text-xs font-medium uppercase">{t('invoices.client')}</p>
        <p className="font-semibold">{model.buyer.name}</p>
        {model.buyer.visibleFields.company && model.buyer.company && <p>{model.buyer.company}</p>}
        {model.buyer.addressLines.map((line) => <p key={line}>{line}</p>)}
        {model.buyer.visibleFields.email && model.buyer.email && <p>{model.buyer.email}</p>}
        {model.buyer.visibleFields.phone && model.buyer.phone && <p>{model.buyer.phone}</p>}
        {model.buyer.visibleFields.taxNumber && <p>{t('contracts.party.taxNumber')}: {model.buyer.taxNumber ?? ''}</p>}
        {model.buyer.visibleFields.vatId && <p>{t('contracts.party.vatId')}: {model.buyer.vatId ?? ''}</p>}
      </section>

      <div className="invoice-print-meta text-sm">
        <strong>{t('invoices.invoiceNumber')}: {model.invoiceNumber}</strong>
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

      {model.seller.showDetails && <footer className="invoice-print-footer">
        <div className="invoice-print-footer-legal">
          <p className="font-semibold">{t('invoiceSettings.paymentDetails')}</p>
          <dl>
            <div><dt>{t('invoiceSettings.accountHolder')}:</dt><dd>{model.seller.accountHolder ?? ''}</dd></div>
            <div><dt>{t('invoiceSettings.bankName')}:</dt><dd>{model.seller.bankName ?? ''}</dd></div>
            <div><dt>IBAN:</dt><dd>{model.seller.iban ?? ''}</dd></div>
            <div><dt>BIC:</dt><dd>{model.seller.bic ?? ''}</dd></div>
          </dl>
        </div>
      </footer>}
    </article>
  )
}
