import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const transactionsPage = readFileSync(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')

test('keeps Kassenbuch as a fixed five-column A4 document on every viewport', () => {
  assert.match(css, /@page\s*{[\s\S]*size:\s*A4 portrait/)
  assert.match(css, /\.print-area\.print-kassenbuch\s*{[\s\S]*width:\s*185\.5mm !important/)
  assert.match(css, /\.kassenbuch-income-column,[\s\S]*width:\s*15%/)
  assert.match(css, /\.kassenbuch-expense-column[\s\S]*width:\s*15%/)
  assert.match(css, /\.kassenbuch-date-column\s*{[\s\S]*width:\s*15%/)
  assert.match(css, /\.kassenbuch-balance-column\s*{[\s\S]*width:\s*18%/)
  assert.match(css, /\.kassenbuch-text-column\s*{[\s\S]*width:\s*33%/)
})

test('removes iOS phantom-page contributors without changing Standard print', () => {
  assert.match(css, /body:has\(\.print-kassenbuch\) \.min-h-screen[\s\S]*min-height:\s*0 !important/)
  assert.match(css, /body:has\(\.print-kassenbuch\) > div > \.flex-1[\s\S]*flex:\s*none !important/)
  assert.match(css, /\.print-area\.print-kassenbuch\s*{[\s\S]*min-width:\s*0 !important/)
  assert.doesNotMatch(css, /\.print-area\.print-kassenbuch\s*{[\s\S]*min-width:\s*186mm !important/)
  assert.doesNotMatch(css, /\.print-area\.print-kassenbuch\s*{[\s\S]*(?:min-)?height:\s*297mm/)
  assert.doesNotMatch(transactionsPage, /@page\s*{\s*margin-bottom:\s*16mm/)
  assert.match(transactionsPage, /unclassifiedPaymentCount > 0 \|\|[\s\S]*<footer className="kassenbuch-notes">/)
  assert.match(transactionsPage, /activePrintFormat === 'standard'[\s\S]*print-compact print-report/)
})

test('preserves month breaks and print-only balance hierarchy', () => {
  assert.match(css, /\.kassenbuch-month \+ \.kassenbuch-month\s*{[\s\S]*break-before:\s*page/)
  assert.match(transactionsPage, /kassenbuch-daily-closing/)
  assert.match(transactionsPage, /showKassenbuchMonthEndBalance/)
  assert.match(transactionsPage, /kassenbuch-period-summary/)
})
