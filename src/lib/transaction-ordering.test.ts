import assert from 'node:assert/strict'
import test from 'node:test'
const { buildKassenbuch } = await import(new URL('./kassenbuch.ts', import.meta.url).href)
const { mergeTransactionsByDate, orderTransactions } = await import(new URL('./transaction-ordering.ts', import.meta.url).href)
const { transactionOrderingDictionaries } = await import(new URL('./transaction-ordering-i18n.ts', import.meta.url).href)

const transactions = [
  { id: 'i2', type: 'income' as const, date: '2026-10-11', title: 'Zulu', description: null, amount: 40, currency: 'EUR', payment_method: 'cash', created_at: '2026-10-11T12:00:00Z' },
  { id: 'e1', type: 'expense' as const, date: '2026-10-11', title: 'Alpha', description: null, amount: 15, currency: 'EUR', payment_method: 'cash', created_at: '2026-10-11T10:00:00Z' },
  { id: 'i1', type: 'income' as const, date: '2026-10-10', title: 'Beta', description: null, amount: 20, currency: 'EUR', payment_method: 'cash', created_at: '2026-10-10T10:00:00Z' },
]

test('merges descending server-ordered transaction lists and preserves income-first date ties', () => {
  const incomes = [
    { id: 'income-new', date: '2026-05-03' },
    { id: 'income-tie', date: '2026-05-02' },
    { id: 'income-old', date: '2026-05-01' },
  ]
  const expenses = [
    { id: 'expense-new', date: '2026-05-04' },
    { id: 'expense-tie', date: '2026-05-02' },
    { id: 'expense-old', date: '2026-04-30' },
  ]

  assert.deepEqual(mergeTransactionsByDate(incomes, expenses).map(({ id }: { id: string }) => id), [
    'expense-new', 'income-new', 'income-tie', 'expense-tie', 'income-old', 'expense-old',
  ])
})

test('merging transactions handles an empty source', () => {
  const rows = [{ id: 'one', date: '2026-05-01' }]
  assert.deepEqual(mergeTransactionsByDate(rows, []), rows)
  assert.deepEqual(mergeTransactionsByDate([], rows), rows)
})

test('supports each requested transaction ordering deterministically', () => {
  assert.deepEqual(orderTransactions(transactions, 'date-desc', 'chronological', 'chronological').map((item: { id: string }) => item.id), ['e1', 'i2', 'i1'])
  assert.deepEqual(orderTransactions(transactions, 'date-asc', 'chronological', 'chronological').map((item: { id: string }) => item.id), ['i1', 'e1', 'i2'])
  assert.deepEqual(orderTransactions(transactions, 'amount-desc', 'chronological', 'chronological').map((item: { id: string }) => item.id), ['i2', 'i1', 'e1'])
  assert.deepEqual(orderTransactions(transactions, 'amount-asc', 'chronological', 'chronological').map((item: { id: string }) => item.id), ['e1', 'i1', 'i2'])
  assert.deepEqual(orderTransactions(transactions, 'title-asc', 'chronological', 'chronological').map((item: { id: string }) => item.id), ['e1', 'i1', 'i2'])
  assert.deepEqual(orderTransactions(transactions, 'title-desc', 'chronological', 'chronological').map((item: { id: string }) => item.id), ['i2', 'i1', 'e1'])
})

test('supports global type grouping and per-day type ordering', () => {
  assert.deepEqual(orderTransactions(transactions, 'date-desc', 'income-first', 'chronological').map((item: { id: string }) => item.id), ['i2', 'i1', 'e1'])
  assert.deepEqual(orderTransactions(transactions, 'date-desc', 'expenses-first', 'chronological').map((item: { id: string }) => item.id), ['e1', 'i2', 'i1'])
  assert.deepEqual(orderTransactions(transactions, 'date-desc', 'chronological', 'income-first').map((item: { id: string }) => item.id), ['i2', 'e1', 'i1'])
  assert.deepEqual(orderTransactions(transactions, 'date-desc', 'chronological', 'expenses-first').map((item: { id: string }) => item.id), ['e1', 'i2', 'i1'])
})

test('filters before ordering and paginates the ordered result', () => {
  const filtered = transactions.filter((transaction) => transaction.type === 'income')
  const ordered = orderTransactions(filtered, 'date-desc', 'chronological', 'chronological')
  assert.deepEqual(ordered.slice(0, 1).map((item: { id: string }) => item.id), ['i2'])
  assert.deepEqual(ordered.slice(1).map((item: { id: string }) => item.id), ['i1'])
})

test('provides complete ordering UI translations in all supported locales', () => {
  const keys = [
    'transactions.order', 'transactions.order.date-desc', 'transactions.order.date-asc',
    'transactions.order.amount-desc', 'transactions.order.amount-asc', 'transactions.order.title-asc',
    'transactions.order.title-desc', 'transactions.groupOrder', 'transactions.group.chronological',
    'transactions.group.income-first', 'transactions.group.expenses-first', 'transactions.withinDay',
    'transactions.withinDay.chronological', 'transactions.withinDay.income-first', 'transactions.withinDay.expenses-first', 'transactions.bulkActions',
    'transactions.typeFilter', 'transactions.allTypes', 'transactions.categoryFilter',
    'transactions.allCategories', 'transactions.printOrdering', 'transactions.printFilters',
    'transactions.kassenbuchFixedOrder',
  ]
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr']) {
    const dictionary = transactionOrderingDictionaries[locale as keyof typeof transactionOrderingDictionaries]
    for (const key of keys) assert.ok(dictionary[key], `${locale}: ${key}`)
    assert.notEqual(dictionary['transactions.group.chronological'], dictionary['transactions.withinDay.chronological'], `${locale}: chronological controls must describe distinct behavior`)
  }
})

test('transaction page separates search/filtering, sorting, bulk actions, and full conversion detail', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')
  const financeList = await readFile(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')
  assert.match(source, /filters=\{<>[\s\S]*FinanceSearchInput[\s\S]*transactions\.typeFilter[\s\S]*transactions\.categoryFilter[\s\S]*<\/>/)
  assert.match(source, /sorting=\{<>[\s\S]*transactions\.group\.\$\{value\}[\s\S]*transactions\.withinDay\.\$\{value\}[\s\S]*<\/>/)
  assert.match(source, /aria-label=\{t\('transactions\.bulkActions'\)\}[\s\S]*transactions\.bulkRename/)
  assert.match(source, /CurrencyConversionDisclosure label=\{t\('currencySnapshot\.noSnapshotShort'\)\} detail=\{t\('currencySnapshot\.noSnapshot'\)\}/)
  assert.match(financeList, /<details className="max-w-full text-left">[\s\S]*<summary[\s\S]*<p className="max-w-full whitespace-normal break-words/)
  assert.match(source, /selectionLabel=\{t\('transactions\.select'\)\}/)
})

test('presentation ordering cannot change Kassenbuch balances or totals', () => {
  const ordered = orderTransactions(transactions, 'amount-desc', 'income-first', 'income-first')
  const build = (periodTransactions: typeof transactions) => buildKassenbuch({
    openingTransactions: [],
    periodTransactions,
    currency: 'EUR',
  })

  const canonical = build(transactions)
  const reordered = build(ordered)
  assert.equal(reordered.closingBalanceMinor, canonical.closingBalanceMinor)
  assert.equal(reordered.incomeTotalMinor, canonical.incomeTotalMinor)
  assert.equal(reordered.expenseTotalMinor, canonical.expenseTotalMinor)
  assert.deepEqual(reordered.rows, canonical.rows)
})
