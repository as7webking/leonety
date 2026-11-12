import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { accountingUxDictionaries } from './accounting-ux-i18n.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { createInvoiceDocumentModel, createInvoiceDocumentSnapshot, estimateInvoicePageCount } from './invoice-document.ts'
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

test('invoice pagination is enabled only after the estimated document exceeds two A4 pages', () => {
  const pageHeight = 1032
  assert.equal(estimateInvoicePageCount([pageHeight], pageHeight), 1)
  assert.equal(estimateInvoicePageCount([pageHeight * 1.9], pageHeight), 2)
  assert.equal(estimateInvoicePageCount([pageHeight * 2.1], pageHeight), 3)
  assert.equal(estimateInvoicePageCount([pageHeight, pageHeight], pageHeight), 2)
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
  for (const className of ['invoice-print-header', 'invoice-print-title', 'invoice-print-issuer', 'invoice-print-client', 'invoice-print-table', 'invoice-print-totals', 'invoice-print-payment', 'invoice-print-footer']) {
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
  assert.match(renderer, /<p className="whitespace-pre-line">\{model\.seller\.address\}<\/p>/)
  assert.match(renderer, /model\.seller\.showDetails && <footer className="invoice-print-footer">/)
  assert.match(renderer, /invoice-print-title[\s\S]*invoice-print-issuer[\s\S]*invoice-print-client/)
  assert.match(renderer, /invoices\.client/)
  assert.match(renderer, /invoices\.invoiceNumber'\)\}: \{model\.invoiceNumber\}/)
  assert.match(renderer, /model\.seller\.showDetails && \(/)
  assert.match(renderer, /issuer\.name/)
  assert.match(renderer, /issuer\.email/)
  assert.match(renderer, /model\.buyer\.addressLines\.map/)
  assert.doesNotMatch(renderer, /model\.buyer\.visibleFields\.address && model\.buyer\.addressLines\.map/)
  assert.match(renderer, /model\.buyer\.addressLines\.map/)
  assert.doesNotMatch(renderer, /model\.buyer\.name \|\| t\('invoices\.noClient'\)/)
  assert.match(renderer, /invoice-print-totals[\s\S]*invoice-print-footer/)
  assert.match(renderer, /model\.items\.map[\s\S]*item\.description/)
  assert.doesNotMatch(renderer, /repeatBankDetails[\s\S]*IBAN/)
  assert.match(renderer, /model\.seller\.showDetails && \([\s\S]*?model\.seller\.address/)
  assert.match(renderer, /contracts\.party\.email[^\n]*model\.seller\.email/)
  assert.match(renderer, /contracts\.party\.taxNumber[^\n]*model\.seller\.taxNumber/)
  assert.match(renderer, /contracts\.party\.vatId[^\n]*model\.seller\.vatId/)
  assert.doesNotMatch(renderer, /model\.seller\.(email|phone|taxNumber|vatId)\s*&&/)
  assert.match(renderer, /invoice-print-issuer[\s\S]*model\.seller\.taxNumber[\s\S]*model\.seller\.vatId[\s\S]*invoice-print-meta/)
  assert.match(renderer, /invoice-print-footer[\s\S]*model\.seller\.(bic|bankName|accountHolder)/)
  assert.match(renderer, /<dt>IBAN:<\/dt><dd>\{model\.seller\.iban \?\? ''\}<\/dd>/)
  assert.match(renderer, /<dt>\{t\('invoiceSettings\.bankName'\)\}:<\/dt><dd>\{model\.seller\.bankName \?\? ''\}<\/dd>/)
  assert.match(renderer, /printTemplate\?: 'business' \| 'minimal'/)
  assert.match(styles, /invoice-print-template-minimal \.invoice-print-client/)
  assert.match(renderer, /<dt>BIC:<\/dt><dd>\{model\.seller\.bic \?\? ''\}<\/dd>/)
  assert.match(styles, /invoice-print-show-page-numbers/)
  assert.match(styles, /counter\(page\)[\s\S]*counter\(pages\)/)
  assert.match(page, /invoice-print-show-page-numbers.*pages > 2/)
  assert.match(page, /beforeprint/)
  assert.match(page, /invoices\.printTemplateBusiness/)
  assert.match(page, /invoices\.printTemplateMinimal/)
  assert.doesNotMatch(page, /\['address', 'invoices\.includeClientAddress'\]/)
  assert.match(page, /taxNumber: checked, vatId: checked/)
  assert.match(page, /issuerProfile: issuerProfile\?\.userId === userId/)
  assert.match(styles, /\.invoice-print-document\s*\{[\s\S]*?min-height:\s*273mm/)
  assert.match(styles, /\.invoice-print-footer\s*\{[\s\S]*?margin-top:\s*auto/)
  assert.match(styles, /\.print-area\.print-invoice\s*\{[\s\S]*?width:\s*186mm/)
  assert.match(styles, /invoice-print-footer-legal dl\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(styles, /print-invoice-batch \.invoice-print-document:not\(:last-of-type\)/)
  assert.equal((page.match(/seller:\s*sellerPresentation/g) ?? []).length, 2)
  assert.match(page, /companyLegalLoaded\s*\|\|\s*!companyBrandingLoaded/)
  assert.match(page, /from\('profiles'\)[\s\S]*select\('full_name, email'\)[\s\S]*eq\('id', userId\)/)
  assert.doesNotMatch(page, /select\([^)]*profile_number[^)]*\)[\s\S]*issuerProfile/)
  assert.match(page, /issuerProfile=\{issuerProfile\?\.userId === userId \? issuerProfile : undefined\}/)
  assert.match(page, /legal_name\?\.trim\(\)\s*\|\|\s*currentCompany\?\.name/)
  assert.match(page, /api\/workspaces\/legal\?companyId=/)
  assert.match(modelSource, /These are canonical persisted invoice values\. Renderers must never recalculate them\./)
})

test('version 3 snapshots freeze seller, selected issuer, buyer, line items and canonical totals', () => {
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
    issuerProfile: { name: 'Invoice Owner', email: 'owner@example.test' },
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

  assert.equal(snapshot.schemaVersion, 3)
  assert.deepEqual(snapshot.issuerProfile, presentation.issuerProfile)
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
  assert.deepEqual(rendered.issuerProfile, presentation.issuerProfile)
  assert.equal(rendered.items.length, 2)
  assert.equal(rendered.items[0].unit, 'hours')
  assert.equal(rendered.items[0].description, 'Service\nwith details')
  assert.deepEqual(rendered.totals, { subtotal: 50, taxAmount: 9.5, total: 59.5 })
  assert.equal(rendered.paymentTerms, 'Pay within 14 days')
})

test('seller opt-out excludes issuer identity from the saved snapshot', () => {
  const model = createInvoiceDocumentModel({
    id: 'invoice-private-issuer', invoice_number: '26-005', status: 'sent', issue_date: '2026-11-10', due_date: null,
    currency: 'EUR', notes: null, subtotal: 0, tax_amount: 0, total: 0, invoice_items: [],
    clients: { name: 'Recipient', client_company: 'Hidden Company', email: 'hidden@example.test', phone: 'Hidden phone', tax_number: 'HIDDEN-TAX', vat_id: 'HIDDEN-VAT' },
  }, {
    seller: { name: 'Seller', logo: '', address: '', email: '', taxNumber: '', iban: '', bic: '', showDetails: false },
    issuerProfile: { name: 'Private issuer', email: 'private@example.test' },
    buyerAddressLines: ['Recipient Street 1'],
    buyerVisibleFields: { company: false, email: false, phone: false, address: false, taxNumber: false, vatId: false },
    payment: { method: 'bank_transfer', amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: false, repeatBankDetails: true },
  })

  const snapshot = createInvoiceDocumentSnapshot(model, '2026-11-10T10:00:00.000Z')
  assert.equal(snapshot.schemaVersion, 3)
  assert.equal(snapshot.issuerProfile, null)
  assert.equal(snapshot.seller.email, '')
  assert.equal(snapshot.seller.iban, '')
  assert.equal(snapshot.buyer.name, 'Recipient')
  assert.deepEqual(snapshot.buyer.addressLines, ['Recipient Street 1'])
  assert.equal(snapshot.buyer.company, null)
  assert.equal(snapshot.buyer.email, null)
  assert.equal(snapshot.buyer.taxNumber, null)
  assert.equal(snapshot.buyer.vatId, null)
})

test('version 2 invoice snapshots remain readable after version 3 is introduced', () => {
  const version2Snapshot = {
    schemaVersion: 2 as const,
    capturedAt: '2026-10-01T10:00:00.000Z',
    templateId: 'standard' as const,
    seller: { name: 'Saved seller', logo: '', address: 'Saved address', email: '', taxNumber: '', iban: '', bic: '', showDetails: true },
    buyer: {
      name: 'Saved buyer', company: null, email: null, phone: null, addressLines: [], taxNumber: null,
      visibleFields: { company: false, email: false, phone: false, address: true, taxNumber: false },
    },
    items: [{ description: 'Saved line', quantity: 1, unitPrice: 10, taxRate: 0, lineTotal: 10 }],
    totals: { subtotal: 10, taxAmount: 0, total: 10 },
    payment: { method: 'bank_transfer' as const, amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: false, repeatBankDetails: true, isPaid: false },
    paymentTerms: 'Saved terms',
  }
  const model = createInvoiceDocumentModel({
    id: 'invoice-v2-compat', invoice_number: 'V2', status: 'sent', issue_date: '2026-10-01', due_date: null,
    currency: 'EUR', notes: null, subtotal: 99, tax_amount: 99, total: 198, document_snapshot: version2Snapshot,
  }, {
    seller: { name: 'Current seller', logo: '', address: '', email: '', taxNumber: '', iban: '', bic: '', showDetails: true },
    issuerProfile: { name: 'Current issuer', email: 'current@example.test' },
    buyerAddressLines: [],
    buyerVisibleFields: { company: true, email: true, phone: true, address: true, taxNumber: true },
    payment: { method: 'cash', amountPaid: 0, splitPayment: false, allocations: [], groupAllocations: false, repeatBankDetails: false },
  })

  assert.equal(model.seller.name, 'Saved seller')
  assert.equal(model.issuerProfile?.email, 'current@example.test')
  assert.equal(model.items[0].description, 'Saved line')
  assert.deepEqual(model.totals, { subtotal: 10, taxAmount: 0, total: 10 })
  assert.equal(model.paymentTerms, 'Saved terms')
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
