import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { accountingUxDictionaries } from './accounting-ux-i18n.ts'
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
    seller: { name: 'Old seller', logo: 'old-logo', address: 'Old address', email: 'old-seller@example.test', taxNumber: 'OLD-TAX', vatId: 'DE123456789', representative: 'Old representative', commercialRegister: 'HRB', registerCourt: 'Berlin', registrationNumber: '12345', iban: 'OLD-IBAN', bic: '', showDetails: true },
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
    seller: { ...presentation.seller, name: 'New seller', address: 'New address', taxNumber: 'NEW-TAX', vatId: 'DE987654321', registrationNumber: '99999' },
    buyerAddressLines: ['New street', 'New city'],
  })

  assert.equal(laterModel.seller.name, 'Old seller')
  assert.equal(laterModel.seller.address, 'Old address')
  assert.equal(laterModel.seller.taxNumber, 'OLD-TAX')
  assert.equal(laterModel.seller.vatId, 'DE123456789')
  assert.equal(laterModel.seller.registrationNumber, '12345')
  assert.equal(laterModel.buyer.name, 'Old buyer')
  assert.deepEqual(laterModel.buyer.addressLines, ['Old street', 'Old city'])
  assert.equal(laterModel.templateId, 'standard')
  assert.deepEqual(laterModel.totals, { subtotal: 123.45, taxAmount: 23.46, total: 146.91 })
  assert.equal(laterModel.items[0].lineTotal, 123.45)
})

test('legacy snapshots never invent missing historical seller or buyer tax details', () => {
  const invoice = {
    id: 'invoice-legacy', invoice_number: '26-002', status: 'sent' as const, issue_date: '2026-10-06', due_date: null,
    currency: 'EUR', notes: null, subtotal: 100, tax_amount: 19, total: 119,
    document_snapshot: {
      schemaVersion: 1 as const, capturedAt: '2026-10-06T10:00:00.000Z', templateId: 'standard' as const,
      seller: { name: 'Captured seller', logo: '', address: 'Captured address', email: '', taxNumber: '', iban: '', bic: '', showDetails: true },
      buyer: { name: 'Captured buyer', company: null, email: null, phone: null, addressLines: [], taxNumber: null, visibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true } },
    },
  }
  const model = createInvoiceDocumentModel(invoice, {
    seller: { name: 'Current seller', logo: '', address: 'Current address', email: 'office@example.test', taxNumber: '12/345/67890', vatId: 'DE123456789', phone: '+49 123 456', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', showDetails: false },
    buyerAddressLines: [],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true },
    payment: { method: 'bank_transfer', amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: true, repeatBankDetails: true },
  })

  assert.equal(model.seller.name, 'Captured seller')
  assert.equal(model.seller.address, 'Captured address')
  assert.equal(model.seller.email, '')
  assert.equal(model.seller.taxNumber, '')
  assert.equal(model.seller.vatId, undefined)
  assert.equal(model.seller.phone, undefined)
  assert.equal(model.seller.iban, '')
  assert.equal(model.seller.bic, '')
  assert.deepEqual(model.totals, { subtotal: 100, taxAmount: 19, total: 119 })
})

test('current print preference overrides the historical snapshot visibility flag', () => {
  const invoice = {
    id: 'invoice-legacy', invoice_number: '26-003', status: 'sent' as const, issue_date: '2026-10-06', due_date: null,
    currency: 'EUR', notes: null, subtotal: 10, tax_amount: 0, total: 10,
    document_snapshot: {
      schemaVersion: 1 as const, capturedAt: '2026-10-06T10:00:00.000Z', templateId: 'standard' as const,
      seller: { name: 'Seller', logo: '', address: 'Old address', email: 'old@example.test', taxNumber: 'OLD-TAX', iban: 'OLD-IBAN', bic: '', showDetails: true },
      buyer: { name: 'Buyer', company: null, email: null, phone: null, addressLines: [], taxNumber: null, visibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true } },
    },
  }
  const model = createInvoiceDocumentModel(invoice, {
    seller: { name: 'Seller', logo: '', address: '', email: '', taxNumber: '', iban: '', bic: '', showDetails: false },
    buyerAddressLines: [],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true },
    payment: { method: 'bank_transfer', amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: true, repeatBankDetails: true },
  })

  assert.equal(model.seller.showDetails, false)
  assert.equal(model.seller.email, 'old@example.test')
  assert.equal(model.seller.iban, 'OLD-IBAN')
})

test('single and batch print use one Standard renderer and retain Standard CSS hooks', async () => {
  const [page, renderer] = await Promise.all([
    readFile(new URL('app/(app)/invoices/page.tsx', root), 'utf8'),
    readFile(new URL('components/invoices/standard-invoice-renderer.tsx', root), 'utf8'),
  ])

  assert.equal((page.match(/<StandardInvoiceRenderer/g) ?? []).length, 2)
  assert.doesNotMatch(page, /invoice-print-header/)
  for (const className of ['invoice-print-header', 'invoice-print-brand', 'invoice-print-client', 'invoice-print-table', 'invoice-print-totals', 'invoice-print-payment', 'invoice-print-footer']) {
    assert.match(renderer, new RegExp(className))
  }
  assert.doesNotMatch(renderer, /calculateItems|quantity\s*\*\s*unitPrice/)
  assert.doesNotMatch(renderer, /XRechnung|ZUGFeRD|EN16931/)
})

test('invoice renderer prints seller and buyer tax identifiers independently and retains complete line-item structure', async () => {
  const [renderer, modelSource, page, styles] = await Promise.all([
    readFile(new URL('components/invoices/standard-invoice-renderer.tsx', root), 'utf8'),
    readFile(new URL('./invoice-document.ts', import.meta.url), 'utf8'),
    readFile(new URL('app/(app)/invoices/page.tsx', root), 'utf8'),
    readFile(new URL('app/globals.css', root), 'utf8'),
  ])

  for (const field of ['vatId', 'representative', 'commercialRegister', 'registerCourt', 'registrationNumber', 'professionalRegulatoryInfo', 'additionalLegalText', 'iban']) {
    assert.match(renderer, new RegExp(`model\\.seller\\.${field}`))
  }
  assert.match(renderer, /model\.buyer\.taxNumber/)
  assert.match(renderer, /model\.buyer\.vatId/)
  assert.match(renderer, /item\.unit/)
  assert.match(renderer, /model\.paymentTerms/)
  assert.match(renderer, /model\.seller\.address && <p/)
  assert.match(renderer, /model\.seller\.vatId && <p/)
  assert.match(renderer, /model\.seller\.showDetails && model\.seller\.iban && <footer className="invoice-print-footer"><div className="invoice-print-footer-legal"><p><strong>IBAN:/)
  assert.match(renderer, /invoice-print-client[\s\S]*invoice-print-brand/)
  assert.match(renderer, /invoices\.client/)
  assert.match(renderer, /invoices\.invoiceNumber'\)\}: \{model\.invoiceNumber\}/)
  assert.match(renderer, /issuerProfile\.name/)
  assert.match(renderer, /issuerProfile\.email/)
  assert.match(renderer, /invoice-print-totals[\s\S]*invoice-print-footer/)
  assert.match(renderer, /model\.items\.map[\s\S]*item\.description/)
  assert.doesNotMatch(renderer, /repeatBankDetails[\s\S]*IBAN/)
  assert.match(renderer, /showDetails && model\.seller\.address/)
  assert.doesNotMatch(renderer, /invoice-print-footer-legal[\s\S]*model\.seller\.email/)
  assert.match(renderer, /model\.seller\.showDetails && model\.seller\.address/)
  assert.match(renderer, /model\.seller\.showDetails && model\.seller\.taxNumber/)
  assert.match(renderer, /model\.seller\.showDetails && model\.seller\.vatId/)
  assert.match(renderer, /invoice-print-header[\s\S]*model\.seller\.taxNumber[\s\S]*model\.seller\.vatId[\s\S]*invoice-print-meta/)
  assert.match(renderer, /model\.seller\.showDetails && model\.seller\.iban/)
  assert.doesNotMatch(renderer, /invoice-print-footer[\s\S]*model\.seller\.(email|phone|taxNumber|vatId|bic|bankName|accountHolder)/)
  assert.match(renderer, /printTemplate\?: 'business' \| 'minimal'/)
  assert.match(styles, /invoice-print-template-minimal \.invoice-print-brand/)
  assert.doesNotMatch(renderer, /invoice-print-footer[\s\S]*model\.seller\.bic/)
  assert.match(page, /invoices\.printTemplateBusiness/)
  assert.match(page, /invoices\.printTemplateMinimal/)
  assert.match(styles, /\.invoice-print-document\s*\{[\s\S]*?min-height:\s*273mm/)
  assert.match(styles, /\.invoice-print-footer\s*\{[\s\S]*?margin-top:\s*auto/)
  assert.match(styles, /\.print-area\.print-invoice\s*\{[\s\S]*?width:\s*168mm/)
  assert.equal((page.match(/seller:\s*sellerPresentation/g) ?? []).length, 2)
  assert.match(page, /companyLegalLoaded\s*\|\|\s*!companyBrandingLoaded/)
  assert.match(page, /from\('profiles'\)[\s\S]*select\('full_name, email'\)[\s\S]*eq\('id', userId\)/)
  assert.doesNotMatch(page, /select\([^)]*profile_number[^)]*\)[\s\S]*issuerProfile/)
  assert.match(page, /issuerProfile=\{issuerProfile\?\.userId === userId \? issuerProfile : undefined\}/)
  assert.match(page, /legal_name\?\.trim\(\)\s*\|\|\s*currentCompany\?\.name/)
  assert.match(page, /api\/workspaces\/legal\?companyId=/)
  assert.match(modelSource, /These are canonical persisted invoice values\. Renderers must never recalculate them\./)
})

test('version 2 snapshots freeze seller, buyer, all line items, payment presentation, terms and existing totals', () => {
  const invoice = {
    id: 'invoice-v2', invoice_number: '26-004', status: 'sent' as const, issue_date: '2026-11-09', due_date: null,
    currency: 'EUR', notes: null, payment_terms: 'Pay within 14 days', subtotal: 50, tax_amount: 9.5, total: 59.5,
    invoice_items: [
      { id: 'line-1', description: 'Service\nwith details', quantity: 2, unit_price: 20, tax_rate: 19, line_total: 40, unit: 'hours' },
      { id: 'line-2', description: 'Product', quantity: 1, unit_price: 10, tax_rate: 19, line_total: 10, unit: 'piece' },
    ],
    clients: { name: 'Buyer', client_company: 'Buyer GmbH', email: 'buyer@example.test', phone: null, tax_number: 'BUYER-TAX', vat_id: 'BUYER-VAT' },
  }
  const presentation = {
    seller: { name: 'Seller GmbH', legalForm: 'GmbH', logo: '', address: 'Street 1', email: 'seller@example.test', taxNumber: 'SELLER-TAX', vatId: 'SELLER-VAT', iban: 'DE00', bic: 'BANKDEFF', accountHolder: 'Seller GmbH', bankName: 'Example Bank', showDetails: true },
    buyerAddressLines: ['Buyer Street 2'],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true, vatId: true },
    payment: { method: 'bank_transfer' as const, amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: false, repeatBankDetails: true },
    paymentTerms: invoice.payment_terms,
  }
  const model = createInvoiceDocumentModel(invoice, presentation)
  const snapshot = createInvoiceDocumentSnapshot(model, '2026-11-09T10:00:00.000Z')
  const rendered = createInvoiceDocumentModel({
    ...invoice,
    document_snapshot: snapshot,
    subtotal: 500, tax_amount: 95, total: 595,
    invoice_items: [],
    payment_terms: 'Changed after issue',
    clients: { ...invoice.clients, name: 'Changed buyer', vat_id: 'CHANGED' },
  }, {
    ...presentation,
    seller: { ...presentation.seller, name: 'Changed seller', iban: 'CHANGED' },
    paymentTerms: 'Changed after issue',
  })

  assert.equal(snapshot.schemaVersion, 2)
  assert.deepEqual(snapshot.seller, presentation.seller)
  assert.equal(snapshot.buyer.vatId, 'BUYER-VAT')
  assert.deepEqual(snapshot.items, model.items)
  assert.deepEqual(snapshot.payment, model.payment)
  assert.equal(snapshot.paymentTerms, 'Pay within 14 days')
  assert.deepEqual(snapshot.totals, { subtotal: 50, taxAmount: 9.5, total: 59.5 })
  assert.equal(rendered.seller.name, 'Seller GmbH')
  assert.equal(rendered.seller.legalForm, 'GmbH')
  assert.equal(rendered.seller.taxNumber, 'SELLER-TAX')
  assert.equal(rendered.seller.vatId, 'SELLER-VAT')
  assert.equal(rendered.seller.accountHolder, 'Seller GmbH')
  assert.equal(rendered.buyer.name, 'Buyer')
  assert.equal(rendered.buyer.taxNumber, 'BUYER-TAX')
  assert.equal(rendered.buyer.vatId, 'BUYER-VAT')
  assert.equal(rendered.items.length, 2)
  assert.equal(rendered.items[0].unit, 'hours')
  assert.equal(rendered.items[0].description, 'Service\nwith details')
  assert.deepEqual(rendered.totals, { subtotal: 50, taxAmount: 9.5, total: 59.5 })
  assert.equal(rendered.paymentTerms, 'Pay within 14 days')
})

test('legacy finalized invoice without a snapshot prints saved lines and totals without backfill or recalculation', async () => {
  const invoice = {
    id: 'legacy-no-snapshot', invoice_number: 'OLD-1', status: 'sent' as const,
    issue_date: '2020-01-01', due_date: null, currency: 'EUR', notes: null,
    subtotal: 80, tax_amount: 15.2, total: 95.2, document_snapshot: null,
    invoice_items: [{ id: 'old-line', description: 'Saved service', quantity: 4, unit_price: 20, tax_rate: 19, line_total: 80 }],
    clients: { name: 'Current client record', client_company: null, email: null, phone: null, tax_number: null },
  }
  const originalValues = structuredClone(invoice)
  const model = createInvoiceDocumentModel(invoice, {
    seller: { name: 'Current workspace record', logo: '', address: '', email: '', taxNumber: '', iban: '', bic: '', showDetails: true },
    buyerAddressLines: [],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true },
    payment: { method: 'bank_transfer', amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: false, repeatBankDetails: true },
  })
  const page = await readFile(new URL('../app/(app)/invoices/page.tsx', import.meta.url), 'utf8')

  assert.equal(model.seller.name, 'Current workspace record')
  assert.equal(model.buyer.name, 'Current client record')
  assert.deepEqual(model.items, [{ id: 'old-line', description: 'Saved service', quantity: 4, unitPrice: 20, taxRate: 19, lineTotal: 80, unit: null }])
  assert.deepEqual(model.totals, { subtotal: 80, taxAmount: 15.2, total: 95.2 })
  assert.deepEqual(invoice, originalValues)
  assert.match(page, /const captureDocumentSnapshot = formData\.status !== 'draft'[\s\S]*!editingInvoice\?\.document_snapshot[\s\S]*\(!editingInvoice \|\| editingInvoice\.status === 'draft'\)/)
  assert.match(page, /confirmLegacyPresentation/)
})

test('long descriptions and large invoice item sets remain intact for multi-page A4 print', async () => {
  const styles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  const longDescription = `Primary service\n${'Detailed scope and delivery conditions. '.repeat(80)}`
  const invoice = {
    id: 'multi-page-invoice', invoice_number: 'MP-1', status: 'sent' as const,
    issue_date: '2026-11-09', due_date: null, currency: 'EUR', notes: null,
    subtotal: 120, tax_amount: 22.8, total: 142.8,
    invoice_items: Array.from({ length: 120 }, (_, index) => ({
      id: `line-${index}`, description: index === 0 ? longDescription : `Service ${index + 1}`,
      quantity: 1, unit_price: 1, tax_rate: 19, line_total: 1,
    })),
    clients: null,
  }
  const model = createInvoiceDocumentModel(invoice, {
    seller: { name: 'Seller', logo: '', address: '', email: '', taxNumber: '', iban: '', bic: '', showDetails: true },
    buyerAddressLines: [],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true },
    payment: { method: 'bank_transfer', amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: false, repeatBankDetails: true },
  })

  assert.equal(model.items.length, 120)
  assert.equal(model.items[0].description, longDescription)
  assert.deepEqual(model.totals, { subtotal: 120, taxAmount: 22.8, total: 142.8 })
  assert.match(styles, /\.print-area\.print-invoice thead\s*\{\s*display:\s*table-header-group/)
  assert.match(styles, /\.print-area\.print-invoice tr\s*\{\s*break-inside:\s*avoid/)
  assert.match(styles, /\.print-area\.print-invoice \.invoice-print-description\s*\{[\s\S]*?white-space:\s*pre-wrap[\s\S]*?overflow-wrap:\s*anywhere/)
  assert.match(styles, /@page\s*\{[\s\S]*?size:\s*A4 portrait/)
})

test('workspace legal API and invoice editor use verified server-backed fields and persist item units', async () => {
  const [route, settings, invoicePage, clientForm, offline, settingsFields, clientPayload] = await Promise.all([
    readFile(new URL('app/api/workspaces/legal/route.ts', root), 'utf8'),
    readFile(new URL('components/settings/workspace-legal-settings.tsx', root), 'utf8'),
    readFile(new URL('app/(app)/invoices/page.tsx', root), 'utf8'),
    readFile(new URL('components/clients/client-form.tsx', root), 'utf8'),
    readFile(new URL('./offline-drafts.ts', import.meta.url), 'utf8'),
    readFile(new URL('./workspace-legal-settings.ts', import.meta.url), 'utf8'),
    readFile(new URL('./client-write-payload.ts', import.meta.url), 'utf8'),
  ])
  for (const field of ['legal_form', 'tax_number', 'account_holder', 'bank_name', 'iban', 'bic', 'payment_terms']) {
    assert.match(`${route}\n${settingsFields}`, new RegExp(`'${field}'`))
    assert.match(settings, new RegExp(field))
  }
  assert.match(route, /requireOwnedCompany/)
  assert.match(clientForm, /value=\{form\.vat_id\}/)
  assert.match(clientPayload, /tax_number: form\.tax_number\.trim\(\) \|\| null/)
  assert.match(clientPayload, /vat_id: form\.vat_id\.trim\(\) \|\| null/)
  assert.match(invoicePage, /payment_terms:\s*formData\.payment_terms/)
  assert.match(invoicePage, /unit: item\.unit\?\.trim\(\) \|\| null/)
  assert.match(offline, /paymentTerms\?: string/)
  assert.match(offline, /unit: text\(item\.unit\)/)
})

test('invoice snapshots are captured only on initial issue or draft finalization and old records are disclosed', async () => {
  const [page, migration] = await Promise.all([
    readFile(new URL('app/(app)/invoices/page.tsx', root), 'utf8'),
    readFile(new URL('../supabase/migrations/20261009160000.sql', root), 'utf8'),
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
    assert.ok(accountingUxDictionaries[locale]['invoices.documentTitle'])
  }
})
