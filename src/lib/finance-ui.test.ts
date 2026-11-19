import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { financeUiDictionaries } from './finance-ui-i18n.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { formatHistoricalRateDetail, matchesFinanceSearch, matchesOptionalDateRange, selectFinanceRecordsForPrint, sortFinanceRecords } from './finance-ui.ts'

const locales = ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const
const requiredKeys = Object.keys(financeUiDictionaries.en)

test('finance UI labels have complete seven-locale coverage', () => {
  for (const locale of locales) {
    assert.deepEqual(Object.keys(financeUiDictionaries[locale]).sort(), [...requiredKeys].sort())
    for (const key of requiredKeys) assert.ok(financeUiDictionaries[locale][key]?.trim(), `${locale}:${key}`)
  }
})

test('page-size labels and title-sort labels are available in all supported locales', () => {
  for (const locale of locales) {
    assert.ok(financeUiDictionaries[locale]['finance.pageSize'])
  }
  const translations = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8')
  assert.equal((translations.match(/'common\.sortTitle':/g) ?? []).length, locales.length)
})

test('finance sorting supports date, amount and title with deterministic ID tie-breaking', () => {
  const records = [
    { id: 'b', date: '2026-01-02', amount: 20, title: 'Beta' },
    { id: 'a', date: '2026-01-02', amount: 20, title: 'Alpha' },
    { id: 'c', date: '2026-01-01', amount: 10, title: 'alpha' },
  ]
  assert.deepEqual(sortFinanceRecords(records, 'date', 'desc', 'en'), ['a', 'b', 'c'].map((id) => records.find((row) => row.id === id)))
  assert.deepEqual(sortFinanceRecords(records, 'amount', 'asc', 'en').map((row) => row.id), ['c', 'a', 'b'])
  assert.deepEqual(sortFinanceRecords(records, 'title', 'asc', 'en').map((row) => row.id), ['a', 'c', 'b'])
  assert.deepEqual(sortFinanceRecords(records, 'title', 'desc', 'en').map((row) => row.id), ['b', 'a', 'c'])
})

test('verified historical rate metadata is formatted locally without inventing unavailable details', () => {
  const detail = formatHistoricalRateDetail({
    rate: '0.54000000',
    source: 'Frankfurter',
    rateDate: '2026-09-30',
    fromCurrency: 'AZN',
    toCurrency: 'EUR',
    locale: 'en-GB',
    label: 'Rate',
  })
  assert.equal(detail, 'Rate: 1 AZN = 0.54 EUR · 30/09/2026 · Frankfurter')
  assert.equal(formatHistoricalRateDetail({ rate: '1', source: null, rateDate: null, fromCurrency: 'AZN', toCurrency: 'EUR', locale: 'en', label: 'Rate' }), null)
  assert.equal(formatHistoricalRateDetail({ rate: '1', source: null, rateDate: '2026-02-30', fromCurrency: 'AZN', toCurrency: 'EUR', locale: 'en', label: 'Rate' }), null)
})

test('print selection uses all filtered records by default and only selected filtered records when selected', () => {
  const dateFiltered = [{ id: 'in-range-1' }, { id: 'in-range-2' }]
  assert.deepEqual(selectFinanceRecordsForPrint(dateFiltered, []), dateFiltered)
  assert.deepEqual(selectFinanceRecordsForPrint(dateFiltered, ['in-range-2', 'outside-range']), [{ id: 'in-range-2' }])
  assert.deepEqual(selectFinanceRecordsForPrint(dateFiltered, ['outside-range']), [])
})

test('income, expenses and transactions use the shared finance list architecture', () => {
  for (const route of ['income', 'expenses', 'transactions']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /FinanceToolbar/)
    assert.match(source, /FinanceListShell/)
    assert.match(source, /FinanceListRow/)
    assert.match(source, /FinanceEmptyState/)
  }
})

test('selectable finance modules place selection through the shared row slot', () => {
  const income = readFileSync(new URL('../app/(app)/income/page.tsx', import.meta.url), 'utf8')
  const transactions = readFileSync(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')
  assert.match(income, /FinanceSelectionBar/)
  assert.match(income, /selection=\{/)
  assert.match(transactions, /finance\.selectVisible/)
  assert.match(transactions, /selection=\{/)
})

test('shared mobile rows give finance amounts a full-width line and preserve desktop columns', () => {
  const component = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

  assert.match(component, /finance-list-actions-without-selection/)
  assert.match(component, /justify-start gap-2 lg:flex-nowrap lg:justify-end/)
  assert.match(styles, /> :nth-child\(3\)[\s\S]*grid-row: 3/)
  assert.match(styles, /> :nth-child\(4\)[\s\S]*grid-column: 1 \/ 3;[\s\S]*grid-row: 4/)
  assert.match(styles, /> :nth-child\(5\)[\s\S]*grid-row: 5/)
  assert.match(styles, /> :nth-child\(6\)[\s\S]*grid-row: 5/)
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) max-content/)
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*grid-template-columns: minmax\(0, 1\.5fr\)[\s\S]*minmax\(176px, max-content\)/)
})

test('income and expense rows constrain conversion details beside action columns', () => {
  const component = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  for (const route of ['income', 'expenses']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /currencySnapshot\.noSnapshot/)
    assert.match(source, /conversionStatus=\{/)
    assert.match(source, /actions=\{<>[\s\S]*?aria-label=/)
  }
  assert.match(component, /min-w-0 max-w-full whitespace-normal break-words text-xs leading-4/)
  assert.match(component, /aria-label=\{conversionStatus\.label\}/)
  assert.match(component, /lg:flex-nowrap/)
})

test('conversion status stays separate from the unbroken amount and remains keyboard/touch expandable', () => {
  const component = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  const transactions = readFileSync(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')
  assert.match(transactions, /conversionStatus=\{/)
  assert.match(component, /grid-cols-1 gap-y-1 text-left lg:text-right/)
  assert.match(component, /overflow-x-auto whitespace-nowrap font-semibold leading-5 tabular-nums/)
  assert.match(component, /type="button"[\s\S]*aria-expanded=\{conversionDetailsOpen\}[\s\S]*aria-controls=\{conversionDetailsId\}/)
  assert.match(component, /className="flex min-h-11 min-w-11 max-w-full shrink-0/)
  assert.match(component, /focus-visible:ring-2/)
  assert.match(component, /<p id=\{conversionDetailsId\} role="note" hidden=\{!conversionDetailsOpen\}/)
  assert.match(component, /setConversionDetailsOpen\(\(open\) => !open\)/)
})

test('shared financial rows keep actions before the rightmost selection slot and compact spacing', () => {
  const component = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(component, /gap-y-2 px-4 py-3/)
  assert.match(component, /\{actions\}[\s\S]*?selection && <div/)
  assert.match(css, /minmax\(120px, 140px\) minmax\(176px, max-content\) 52px/)
})

test('finance toolbars separate utilities, filters and sorting without changing control availability', () => {
  const component = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  for (const route of ['income', 'expenses']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /sortingLabel=\{t\('common\.sortBy'\)\}/)
    assert.match(source, /sorting=\{/)
    assert.match(source, /utilities=\{/)
    assert.match(source, /filters=\{/)
  }
  assert.match(component, /aria-label=\{filtersLabel\}/)
  assert.match(component, /sorting &&/)
  assert.match(component, /sortingLabel\}/)
})

test('Income and Expenses keep printing visible while preserving existing print currency formats', () => {
  for (const route of ['income', 'expenses']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /primaryAction=\{\w+\.length > 0 \? <Button variant="outline" onClick=\{handlePrint\} size="sm">\{selected\w+Ids\.length > 0 \? `\$\{t\('common\.print'\)\} · \$\{t\('finance\.selectedCount'\)/)
    assert.match(source, /const printable\w+ = selectFinanceRecordsForPrint\(sorted\w+, selected\w+Ids\)/)
    assert.match(source, /group\w+\(printable\w+\)/)
    assert.match(source, /printCurrencyMode, setPrintCurrencyMode/)
    assert.match(source, /value: 'workspace', label: t\('currencySnapshot\.workspaceOnly'\)/)
    assert.match(source, /value: 'both', label: t\('currencySnapshot\.originalAndWorkspace'\)/)
    assert.match(source, /window\.print\(\)/)
    assert.match(source, /createHistoricalTransactionFxSnapshot/)
    assert.match(source, /\.from\('\w+'\)\.delete\(\)\.eq\('id', id\)\.eq\('company_id', currentCompany\.id\)/)
  }
})

test('Income and Expenses paginate filtered and sorted results while print keeps the full filtered set', () => {
  for (const route of ['income', 'expenses']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /const \[pageSize, setPageSize\] = useState\(FINANCE_PAGE_SIZE\)/)
    assert.match(source, /Math\.ceil\(sorted\w+\.length \/ pageSize\)/)
    assert.match(source, /sorted\w+\.slice\(\(page - 1\) \* pageSize, page \* pageSize\)/)
    assert.match(source, /selectFinanceRecordsForPrint\(sorted\w+, selected\w+Ids\)/)
    assert.match(source, /pageSizeLabel=\{t\('finance\.pageSize'\)\}/)
    assert.match(source, /setPageSize\(value\); setPage\(1\)/)
  }
  const component = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  assert.match(component, /\[10, 25, 50, 100\]/)
})

test('bulk selection label is left of the right-aligned checkbox without changing selection actions', () => {
  const component = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  const bar = component.slice(component.indexOf('export function FinanceSelectionBar'), component.indexOf('interface FinanceEmptyStateProps'))
  assert.ok(bar.indexOf('{children}') < bar.indexOf('{selectedLabel}'))
  assert.ok(bar.indexOf('{selectedLabel}') < bar.indexOf('{selectVisibleLabel}'))
  assert.ok(bar.indexOf('{selectVisibleLabel}') < bar.indexOf('<input type="checkbox"'))
  assert.match(bar, /ml-auto flex min-h-11 shrink-0[\s\S]*whitespace-nowrap/)
  assert.match(bar, /checked=\{checked\} onChange=\{\(event\) => onCheckedChange\(event\.target\.checked\)\}/)
})

test('Income and Expenses retain separate input contracts while keeping CRUD and FX handlers', () => {
  for (const route of ['income', 'expenses']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /const handleSubmit = async/)
    assert.match(source, /const handleEdit = \(/)
    assert.match(source, /const handleDuplicate = async/)
    assert.match(source, /const handleDelete = async/)
    assert.match(source, /transactionFxInputsChanged\(editingEntry, validatedData\)/)
    assert.match(source, /fxResult\?\.snapshot/)
  }
})

test('workspace selector truncates long names while preserving their full option label', () => {
  const selector = readFileSync(new URL('../components/app-select.tsx', import.meta.url), 'utf8')
  const workspace = readFileSync(new URL('../components/app-shell/workspace-selector-client.tsx', import.meta.url), 'utf8')
  assert.match(selector, /<span className="truncate">\{selected\?\.label/)
  assert.match(workspace, /label: `\$\{company\.name\} \(\$\{company\.type\}\)`/)
})

test('transactions use the dedicated localized empty-state title', () => {
  const source = readFileSync(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /emptyTitle=\{t\('finance\.noTransactionsYet'\)\}/)
  assert.equal(financeUiDictionaries.en['finance.noTransactionsYet'], 'No transactions yet')
})

test('income and expenses expose the same edit, duplicate and delete action order', () => {
  for (const route of ['income', 'expenses']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    const actions = source.match(/actions=\{<>[\s\S]*?<\/>\}/)?.[0] ?? ''
    assert.ok(actions.indexOf('handleEdit') >= 0, `${route}: edit action missing`)
    assert.ok(actions.indexOf('handleDuplicate') > actions.indexOf('handleEdit'), `${route}: duplicate must follow edit`)
    assert.ok(actions.indexOf('setDeleteId') > actions.indexOf('handleDuplicate'), `${route}: delete must follow duplicate`)
  }
})

test('expense title is required while description remains optional', () => {
  const source = readFileSync(new URL('../app/(app)/expenses/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /t\('expenses\.titleRequired'\)/)
  assert.match(source, /aria-label=\{t\('expenses\.titleName'\)\}[\s\S]*?required/)
  assert.match(source, /aria-label=\{t\('expenses\.descriptionOptional'\)\}[\s\S]*?maxLength=\{255\} \/>/)
})

test('finance search is case-insensitive and ignores empty optional fields', () => {
  assert.equal(matchesFinanceSearch('  CHAT  ', ['ChatGPT Plus', null, undefined]), true)
  assert.equal(matchesFinanceSearch('software', ['ChatGPT Plus', 'Subscription', 'Software']), true)
  assert.equal(matchesFinanceSearch('fuel', ['ChatGPT Plus', null, 'Software']), false)
  assert.equal(matchesFinanceSearch('  ', [null]), true)
})

test('income and expenses default to all dates while explicit date filters remain inclusive', () => {
  const dates = ['2021-04-12', '2024-09-03', '2026-11-14']
  assert.deepEqual(dates.filter((date) => matchesOptionalDateRange(date, '', '')), dates)
  assert.deepEqual(dates.filter((date) => matchesOptionalDateRange(date, '2024-09-03', '')), ['2024-09-03', '2026-11-14'])
  assert.deepEqual(dates.filter((date) => matchesOptionalDateRange(date, '', '2024-09-03')), ['2021-04-12', '2024-09-03'])
  assert.deepEqual(dates.filter((date) => matchesOptionalDateRange(date, '2024-09-03', '2024-09-03')), ['2024-09-03'])

  for (const route of ['income', 'expenses']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /const \[filterFromDate, setFilterFromDate\] = useState\(''\)/)
    assert.match(source, /const \[filterToDate, setFilterToDate\] = useState\(''\)/)
    assert.match(source, /matchesOptionalDateRange\(/)
  }
})
