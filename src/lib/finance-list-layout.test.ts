import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const financeList = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
const incomePage = readFileSync(new URL('../app/(app)/income/page.tsx', import.meta.url), 'utf8')
const expensesPage = readFileSync(new URL('../app/(app)/expenses/page.tsx', import.meta.url), 'utf8')
const transactionsPage = readFileSync(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')
const productsPage = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')

test('mobile finance rows give amount and conversion metadata a full-width row', () => {
  assert.match(css, /\.finance-list-grid\s*{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0, 1fr\) max-content/)
  assert.match(css, /\.finance-list-grid > :nth-child\(4\)\s*{\s*grid-column:\s*1 \/ 3;\s*grid-row:\s*4/)
  assert.match(financeList, /grid min-w-0 max-w-full grid-cols-\[minmax\(0,1fr\)_auto\] items-center gap-x-1 gap-y-1 text-left lg:text-right/)
  assert.match(financeList, /whitespace-normal break-words text-left text-xs leading-4 text-amber-800/)
  assert.match(financeList, /<span>\{conversionStatus\.label\}<\/span>/)
  assert.match(financeList, /<p id=\{conversionDetailsId\} role="note" hidden=\{!conversionDetailsOpen\}/)
})

test('desktop finance list retains its six-column table layout', () => {
  assert.match(css, /@media \(min-width:\s*1024px\)\s*{\s*\.finance-list-grid\s*{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.5fr\)[\s\S]*minmax\(176px, max-content\)/)
})

test('finance toolbar adapts one mounted set of controls to mobile disclosures and desktop rows', () => {
  const toolbar = financeList.slice(financeList.indexOf('export function FinanceToolbar'), financeList.indexOf('interface FinanceListShellProps'))
  for (const control of ['{filters}', '{sorting}', '{utilities}']) {
    assert.equal(toolbar.split(control).length - 1, 1, `${control} should only be mounted once`)
  }
  assert.equal((toolbar.match(/<summary/g) ?? []).length, 3)
  assert.match(toolbar, /lg:block lg:space-y-3/)
  assert.match(toolbar, /lg:hidden/)
  assert.match(toolbar, /lg:flex/)
})

test('Income, Expenses and Transactions render date-only values in the active UI locale', () => {
  for (const [name, source, record] of [
    ['Income', incomePage, 'income'],
    ['Expenses', expensesPage, 'expense'],
    ['Transactions', transactionsPage, 'transaction'],
  ] as const) {
    assert.ok(source.includes(`date={new Date(\`\${${record}.date}T00:00:00\`).toLocaleDateString(intlLocale)}`), name)
  }
})

test('Income and Expenses expose category filters while Expense Saved Views retain the selection', () => {
  assert.match(incomePage, /value=\{categoryFilter\} onChange=\{\(value\) => \{ setCategoryFilter\(value\); setSelectedIncomeIds\(\[\]\) \}\}/)
  assert.match(expensesPage, /value=\{categoryFilter\} onChange=\{setCategoryFilter\}/)
  assert.match(expensesPage, /state=\{\{ searchQuery, categoryFilter,/)
  assert.match(expensesPage, /matchesOptionalDateRange\(expense\.date, filterFromDate, filterToDate\) && matchesSearch && \(!categoryFilter \|\| expense\.category === categoryFilter\)/)
})

test('existing Saved Views use the same compact control layout where supported', () => {
  assert.match(productsPage, /kind="products"[\s\S]*?compact/)
  assert.match(expensesPage, /kind="expenses"[\s\S]*?compact/)
  assert.doesNotMatch(incomePage, /<SavedTableViews/)
  assert.doesNotMatch(transactionsPage, /<SavedTableViews/)
})
