import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { canDeleteInvoice, canEditInvoiceContent, invoiceUpdateForFinalized, isInvoiceFinalized, shouldRecordInvoicePayments } from './invoice-immutability.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { invoiceImmutabilityDictionaries } from './invoice-immutability-i18n.ts'

const migration = readFileSync('supabase/migrations/20261120120000.sql', 'utf8')
const page = readFileSync('src/app/(app)/invoices/page.tsx', 'utf8')

test('draft invoices remain editable and deletable until they are issued', () => {
  const draft = { status: 'draft', document_snapshot: null, issued_at: null }
  assert.equal(isInvoiceFinalized(draft), false)
  assert.equal(canEditInvoiceContent(draft), true)
  assert.equal(canDeleteInvoice(draft), true)
  assert.equal(invoiceUpdateForFinalized(draft, 'sent', 'now'), null)
})

test('any non-draft, snapshot-bearing, or issued-at invoice is content-immutable', () => {
  for (const invoice of [
    { status: 'sent' },
    { status: 'draft', document_snapshot: { version: 1 } },
    { status: 'draft', issued_at: '2026-11-20T10:00:00Z' },
  ]) {
    assert.equal(isInvoiceFinalized(invoice), true)
    assert.equal(canEditInvoiceContent(invoice), false)
    assert.equal(canDeleteInvoice(invoice), false)
  }
})

test('finalized invoice updates only carry status and updated_at, never content or draft rollback', () => {
  assert.deepEqual(invoiceUpdateForFinalized({ status: 'sent' }, 'paid', 'now'), {
    status: 'paid', updated_at: 'now',
  })
  assert.deepEqual(invoiceUpdateForFinalized({ status: 'sent' }, 'overdue', 'later'), {
    status: 'overdue', updated_at: 'later',
  })
  assert.deepEqual(invoiceUpdateForFinalized({ status: 'paid' }, 'cancelled', 'later'), {
    status: 'cancelled', updated_at: 'later',
  })
  assert.equal(invoiceUpdateForFinalized({ status: 'paid' }, 'draft', 'now'), null)
})

test('payments are recorded on new paid invoices and the transition to paid, but not rewritten on already-paid records', () => {
  assert.equal(shouldRecordInvoicePayments(null, 'paid', true), true)
  assert.equal(shouldRecordInvoicePayments('sent', 'paid', false), true)
  assert.equal(shouldRecordInvoicePayments('paid', 'paid', false), false)
  assert.equal(shouldRecordInvoicePayments('paid', 'cancelled', false), false)
  assert.equal(shouldRecordInvoicePayments(null, 'paid', true, true), false)
})

test('prepared database triggers protect invoice fields, deletes, and child line mutations', () => {
  assert.match(migration, /before update on public\.invoices/i)
  assert.match(migration, /before delete on public\.invoices/i)
  assert.match(migration, /before insert or update or delete on public\.invoice_items/i)
  assert.match(migration, /to_jsonb\(new\)[\s\S]*status[\s\S]*updated_at/i)
  assert.match(migration, /new\.status\s*=\s*'draft'/i)
  assert.match(migration, /old\.status\s*<>\s*'draft'/i)
  assert.match(migration, /parent_status\s*<>\s*'draft'/i)
  assert.match(migration, /new\.invoice_id\s+is distinct from old\.invoice_id/i)
  assert.match(migration, /tg_op\s*=\s*'DELETE'\s+and pg_trigger_depth\(\)\s*>\s*1/i)
  assert.doesNotMatch(migration, /\b(update|delete|insert)\s+public\.(invoices|invoice_items)\b/i)
  assert.doesNotMatch(migration, /alter\s+policy|create\s+policy|grant\s+/i)
  assert.doesNotMatch(migration, /invoice_payments/i)
})

test('issued invoice UI retains status/payment handling but skips content and item writes', () => {
  assert.match(page, /isFinalizedInvoice/)
  assert.match(page, /editingInvoice && !invoiceAlreadyFinalized && !invoiceItemsAlreadySaved/)
  assert.match(page, /!invoiceAlreadyFinalized && !invoiceItemsAlreadySaved/)
  assert.match(page, /if \(formData\.status !== 'paid'\) return true/)
  assert.match(page, /canDeleteInvoice\(invoice\)/)
  assert.match(page, /\.update\(payloadToSave\)[\s\S]*?\.eq\('id', editingInvoice\.id\)[\s\S]*?\.eq\('company_id', currentCompany\.id\)/)
  assert.match(page, /\.delete\(\)[\s\S]*?\.eq\('id', invoice\.id\)[\s\S]*?\.eq\('company_id', currentCompany\.id\)/)
  assert.match(page, /shouldRecordInvoicePayments\(editingInvoice\?\.status \?\? null, formData\.status, !editingInvoice, reusedExistingFinalizedInvoice\)/)
  assert.match(page, /invoiceTotalForPayment = isFinalizedInvoice \? Number\(editingInvoice\?\.total \?\? 0\)/)
})

test('invoice lines are persisted before draft-to-issued status and snapshot finalization', () => {
  const linesSaved = page.indexOf("if (!invoiceAlreadyFinalized && !invoiceItemsAlreadySaved) {")
  const issued = page.indexOf("if (!invoiceAlreadyFinalized && formData.status !== 'draft') {")
  assert.ok(linesSaved >= 0 && issued > linesSaved)
  assert.match(page.slice(issued, issued + 900), /\.eq\('company_id', currentCompany\.id\)/)
  assert.match(page.slice(issued, issued + 900), /\.eq\('status', 'draft'\)/)
})

test('issued invoice read-only message is translated for every supported locale', () => {
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    assert.ok(invoiceImmutabilityDictionaries[locale]['invoices.issuedContentReadOnly'])
    assert.ok(invoiceImmutabilityDictionaries[locale]['invoices.paidInvoiceReadOnly'])
  }
})
