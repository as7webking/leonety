import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const financeList = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
const globalStyles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const products = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')
const income = readFileSync(new URL('../app/(app)/income/page.tsx', import.meta.url), 'utf8')
const expenses = readFileSync(new URL('../app/(app)/expenses/page.tsx', import.meta.url), 'utf8')
const transactions = readFileSync(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')
const invoices = readFileSync(new URL('../app/(app)/invoices/page.tsx', import.meta.url), 'utf8')

test('shared finance lists keep Amount, Select and Actions in the agreed order', () => {
  const header = financeList.match(/<div className="finance-list-grid hidden[\s\S]*?<\/div>/)?.[0] ?? ''
  assert.ok(header.indexOf('{amountLabel}') < header.indexOf('{selectionLabel}'))
  assert.ok(header.indexOf('{selectionLabel}') < header.indexOf('{actionsLabel}'))
  assert.match(financeList, /whitespace-normal break-words font-semibold[\s\S]*?\{amountDetail &&[\s\S]*?whitespace-normal break-words text-xs/)
  assert.match(globalStyles, /minmax\(120px, 140px\) 52px minmax\(176px, max-content\)/)
})

test('Income and All Transactions use the shared, touch-sized accessible row selection', () => {
  for (const source of [income, transactions]) {
    assert.match(source, /h-11 w-11 cursor-pointer items-center justify-center rounded-md border/)
    assert.match(source, /type="checkbox"[\s\S]*?aria-label=/)
    assert.match(source, /focus-visible:ring-2 focus-visible:ring-blue-600/)
  }
  assert.match(income, /<FinanceSelectionBar/)
  assert.match(transactions, /<FinanceSelectionBar/)
})

test('Product table places selection after product data and before rightmost actions', () => {
  const header = products.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? ''
  const row = products.match(/<tr key=\{product\.id\}[\s\S]*?<\/tr>/)?.[0] ?? ''
  assert.ok(header.indexOf("t('productUx.channelsColumn')") < header.indexOf("t('transactions.select')"))
  assert.ok(header.indexOf("t('transactions.select')") < header.indexOf("t('productUx.actions')"))
  assert.ok(row.indexOf('productSyncs') < row.indexOf('aria-label={`${t(\'transactions.select\')} ${product.name}`}'))
  assert.ok(row.indexOf('aria-label={`${t(\'transactions.select\')} ${product.name}`}') < row.indexOf('handleCopyProduct(product)'))
  assert.match(products, /selected \? 'bg-blue-50\/50'/)
})

test('Expense table remains intentionally unselectable; invoice cards keep selection distinct and visible', () => {
  assert.doesNotMatch(expenses, /FinanceSelectionBar|selectedExpenseIds|selectVisible/)
  assert.match(invoices, /Card key=\{invoice\.id\} className=\{selectedInvoiceIds\.has\(invoice\.id\)/)
  assert.match(invoices, /aria-label=\{`\$\{t\('invoices\.selectInvoice'\)\} \$\{invoice\.invoice_number\}`\}/)
  assert.match(invoices, /flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border/)
})
