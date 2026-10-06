import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { createInvoiceDocumentModel } from './invoice-document.ts'

const root = new URL('../', import.meta.url)

test('invoice document model passes through canonical totals without recalculating them', () => {
  const model = createInvoiceDocumentModel({
    id: 'invoice-1', invoice_number: '26-001', status: 'sent', issue_date: '2026-10-06', due_date: null,
    currency: 'EUR', notes: null, subtotal: 123.45, tax_amount: 23.46, total: 146.91,
    invoice_items: [{ description: 'Service', quantity: 99, unit_price: 99, tax_rate: 19, line_total: 123.45 }],
    clients: null,
  }, {
    seller: { name: 'Leonety workspace', logo: '', address: '', email: '', taxNumber: '', iban: '', bic: '', showDetails: true },
    buyerAddressLines: [],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true },
    payment: { method: 'bank_transfer', amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: true, repeatBankDetails: true },
  })

  assert.deepEqual(model.totals, { subtotal: 123.45, taxAmount: 23.46, total: 146.91 })
  assert.equal(model.items[0].lineTotal, 123.45)
})

test('single and batch print use one Standard renderer and retain Standard CSS hooks', async () => {
  const [page, renderer] = await Promise.all([
    readFile(new URL('app/(app)/invoices/page.tsx', root), 'utf8'),
    readFile(new URL('components/invoices/standard-invoice-renderer.tsx', root), 'utf8'),
  ])

  assert.equal((page.match(/<StandardInvoiceRenderer/g) ?? []).length, 2)
  assert.doesNotMatch(page, /invoice-print-header/)
  for (const className of ['invoice-print-header', 'invoice-print-brand', 'invoice-print-client', 'invoice-print-table', 'invoice-print-totals', 'invoice-print-payment']) {
    assert.match(renderer, new RegExp(className))
  }
  assert.doesNotMatch(renderer, /calculateItems|quantity\s*\*\s*unitPrice/)
  assert.doesNotMatch(renderer, /XRechnung|ZUGFeRD|EN16931/)
})
