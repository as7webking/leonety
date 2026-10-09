import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { createInvoiceDocumentModel, createInvoiceDocumentSnapshot } from './invoice-document.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { invoiceSnapshotDictionaries } from './invoice-snapshot-i18n.ts'

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

test('finalized snapshots preserve seller and buyer presentation while totals remain canonical', () => {
  const invoice = {
    id: 'invoice-1', invoice_number: '26-001', status: 'sent' as const, issue_date: '2026-10-06', due_date: null,
    currency: 'EUR', notes: null, subtotal: 123.45, tax_amount: 23.46, total: 146.91,
    invoice_items: [{ description: 'Service', quantity: 99, unit_price: 99, tax_rate: 19, line_total: 123.45 }],
    clients: { name: 'Old buyer', client_company: 'Old GmbH', email: 'old@example.test', phone: null, tax_number: null },
  }
  const presentation = {
    seller: { name: 'Old seller', logo: 'old-logo', address: 'Old address', email: 'old-seller@example.test', taxNumber: 'OLD-VAT', iban: 'OLD-IBAN', bic: '', showDetails: true },
    buyerAddressLines: ['Old street', 'Old city'],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true },
    payment: { method: 'bank_transfer' as const, amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: true, repeatBankDetails: true },
  }
  const snapshot = createInvoiceDocumentSnapshot(createInvoiceDocumentModel(invoice, presentation), '2026-10-06T10:00:00.000Z')
  const laterModel = createInvoiceDocumentModel({
    ...invoice,
    document_snapshot: snapshot,
    clients: { ...invoice.clients, name: 'New buyer', client_company: 'New GmbH', email: 'new@example.test' },
  }, {
    ...presentation,
    seller: { ...presentation.seller, name: 'New seller', address: 'New address', taxNumber: 'NEW-VAT' },
    buyerAddressLines: ['New street', 'New city'],
  })

  assert.equal(laterModel.seller.name, 'Old seller')
  assert.equal(laterModel.seller.address, 'Old address')
  assert.equal(laterModel.buyer.name, 'Old buyer')
  assert.deepEqual(laterModel.buyer.addressLines, ['Old street', 'Old city'])
  assert.equal(laterModel.templateId, 'standard')
  assert.deepEqual(laterModel.totals, { subtotal: 123.45, taxAmount: 23.46, total: 146.91 })
  assert.equal(laterModel.items[0].lineTotal, 123.45)
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

test('invoice snapshots are captured only on initial issue or draft finalization and old records are disclosed', async () => {
  const [page, migration] = await Promise.all([
    readFile(new URL('app/(app)/invoices/page.tsx', root), 'utf8'),
    readFile(new URL('../supabase/migrations/20261009160000_preserve_invoice_document_snapshots.sql', root), 'utf8'),
  ])

  assert.match(page, /formData\.status !== 'draft'/)
  assert.match(page, /editingInvoice\.status === 'draft'/)
  assert.match(page, /hasLegacyLivePresentation/)
  assert.match(page, /confirmLegacyPresentation/)
  assert.match(migration, /add column if not exists document_snapshot jsonb/i)
  assert.match(migration, /prevent_invoice_document_snapshot_change/)
  assert.match(migration, /non-draft invoice requires a document snapshot/i)
  assert.doesNotMatch(migration, /\b(drop|truncate)\b/i)
  assert.doesNotMatch(migration, /update\s+public\.invoices/i)
})

test('legacy invoice snapshot warning is translated in all seven supported locales', () => {
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    assert.ok(invoiceSnapshotDictionaries[locale]['invoices.legacySnapshotWarning'])
  }
})
