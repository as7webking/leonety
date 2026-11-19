import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const clientDetail = readFileSync(new URL('../app/(app)/clients/[id]/page.tsx', import.meta.url), 'utf8')
const invoicePage = readFileSync(new URL('../app/(app)/invoices/page.tsx', import.meta.url), 'utf8')
const contractsPage = readFileSync(new URL('../app/(app)/contracts/page.tsx', import.meta.url), 'utf8')
function readTree(path: string): string {
  return readdirSync(path).map((entry) => {
    const child = join(path, entry)
    return statSync(child).isDirectory() ? readTree(child) : readFileSync(child, 'utf8')
  }).join('\n')
}

const mailSources = [
  fileURLToPath(new URL('../components/mail', import.meta.url)),
  fileURLToPath(new URL('../app/api/mail', import.meta.url)),
].map(readTree).join('\n')

test('Client 360 related records use canonical client ids and current workspace scope', () => {
  for (const table of ['invoices', 'contracts', 'incomes', 'expenses']) {
    const query = clientDetail.match(new RegExp(`\\.from\\('${table}'\\)[\\s\\S]*?\\.order\\(`))?.[0]
    assert.ok(query, `missing ${table} query`)
    assert.match(query, /\.eq\('company_id', currentCompany\.id\)/)
    assert.match(query, /\.eq\('client_id', params\.id\)/)
  }
  assert.match(clientDetail, /\.from\('clients'\)[\s\S]*?\.eq\('company_id', currentCompany\.id\)[\s\S]*?\.eq\('id', params\.id\)/)
})

test('failed related-record requests cannot render a false empty history', () => {
  assert.match(clientDetail, /setInvoiceLoadFailed\(Boolean\(invoiceResult\.error\)\)/)
  assert.match(clientDetail, /setContractLoadFailed\(Boolean\(contractResult\.error\)\)/)
  assert.match(clientDetail, /setActivityLoadFailed\(relatedErrors\)/)
  assert.match(clientDetail, /else \{\s*setRelatedDataError\(true\)\s*setInvoiceLoadFailed\(true\)/)
  assert.match(clientDetail, /invoiceLoadFailed \? <RelatedDataUnavailable t=\{t\} \/> : <InvoiceList/)
  assert.match(clientDetail, /contractLoadFailed \? <RelatedDataUnavailable t=\{t\} \/> : <ContractList/)
  assert.match(clientDetail, /activityLoadFailed \? <RelatedDataUnavailable t=\{t\} \/> : <ActivityList items=\{activity\.slice\(0, 8\)\}/)
  assert.match(clientDetail, /activityLoadFailed \? <RelatedDataUnavailable t=\{t\} \/> : <ActivityList/)
})

test('recorded payments are shown only from workspace-scoped invoice payment rows', () => {
  const paymentQuery = clientDetail.match(/\.from\('invoice_payments'\)[\s\S]*?\.in\('invoice_id',[^\n]+/)?.[0]
  assert.ok(paymentQuery, 'missing invoice payment query')
  assert.match(paymentQuery, /\.eq\('company_id', currentCompany\.id\)/)
  assert.match(paymentQuery, /\.in\('invoice_id', invoiceRows\.map\(\(invoice\) => invoice\.id\)\)/)
  assert.match(paymentQuery, /paid_at, method/)
  assert.match(clientDetail, /payments\.map\(\(payment, index\)/)
  assert.match(clientDetail, /new Date\(`\$\{payment\.paid_at\}T00:00:00`\)/)
  assert.match(clientDetail, /label: t\('clients\.crm\.paymentRecorded'\)/)
  assert.match(clientDetail, /invoice\.recorded_payment_amount = paymentTotals\.get\(invoice\.id\)/)
  assert.match(clientDetail, /invoiceCurrencies\.get\(payment\.invoice_id\) !== String\(payment\.currency \?\? ''\)\.toUpperCase\(\)/)
  assert.match(clientDetail, /setRelatedDataError\(true\)[\s\S]{0,80}setInvoiceLoadFailed\(true\)/)
  assert.match(clientDetail, /function RecordedPayments\(\{ payments, invoices/)
  assert.match(clientDetail, /const invoicesById = new Map\(invoices\.map\(\(invoice\) => \[invoice\.id, invoice\]\)\)/)
  assert.match(clientDetail, /const invoice = invoicesById\.get\(payment\.invoice_id\)/)
  assert.doesNotMatch(clientDetail.match(/function RecordedPayments[\s\S]*?\n}/)?.[0] ?? '', /status === 'paid'/)
})

test('client profile exposes stored contact, billing, tax and CRM fields without placeholder values', () => {
  const contactsTab = clientDetail.match(/tab === 'contacts' &&[\s\S]*?\n      \{tab === 'notes'/)?.[0] ?? ''
  for (const field of ['client.name', 'client.email', 'client.phone', 'address', 'client.tax_number', 'client.vat_id', 'client.interested_in', 'client.source', 'client.first_contact_at', 'client.last_activity_at']) {
    assert.ok(contactsTab.includes(field), `missing client profile field: ${field}`)
  }
  assert.match(clientDetail, /function ProfileField[\s\S]*?if \(!value\) return null/)
})

test('client data is hidden immediately when the workspace or client scope changes', () => {
  assert.match(clientDetail, /const scopeKey = currentCompany && params\.id \? `\$\{currentCompany\.id\}:\$\{params\.id\}` : ''/)
  assert.match(clientDetail, /loadedScope !== scopeKey/)
  assert.match(clientDetail, /setLoadedScope\(`\$\{companyId\}:\$\{params\.id\}`\)/)
  assert.match(clientDetail, /if \(clientResult\.error\) \{\s*if \(activeRequest !== requestId\.current\) return\s*setClient\(null\)/)
})

test('invoice and contract creation preserve client context and verify it in the workspace', () => {
  assert.match(clientDetail, /buildClientInvoicesHref\(client\.id, \{ create: true \}\)/)
  assert.match(clientDetail, /\/app\/contracts\/new\?clientId=\$\{encodeURIComponent\(client\.id\)\}/)
  assert.match(invoicePage, /clientId[\s\S]{0,180}clients\.some\([\s\S]*?client\.id === clientId/)
  assert.match(contractsPage, /clientsWorkspaceId !== currentCompany\?\.id/)
  assert.match(contractsPage, /clients\.find\(\(item\) => item\.id === preselectedClientId\)/)
  assert.match(contractsPage, /fillPartyBFromClient\(client\)/)
})

test('client mail association is not inferred from an email address', () => {
  assert.doesNotMatch(mailSources, /\.eq\(['"]client_id['"]|\.eq\(['"]clientId['"]|\.from\(['"]clients['"]\)/)
})

test('Client 360 has narrow-screen tab selection and wrapping for long contact data', () => {
  assert.match(clientDetail, /md:hidden[\s\S]*?<AppSelect/)
  assert.match(clientDetail, /hidden overflow-x-auto[\s\S]*?md:flex/)
  assert.match(clientDetail, /break-all[^\n]*\{client\.email\}/)
  assert.match(clientDetail, /grid gap-3 sm:grid-cols-2/)
  assert.match(clientDetail, /flex flex-col gap-3 p-4 sm:flex-row/)
})
