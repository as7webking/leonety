import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { financeUiDictionaries } from './finance-ui-i18n.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { matchesFinanceSearch } from './finance-ui.ts'

const locales = ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const
const requiredKeys = Object.keys(financeUiDictionaries.en)

test('finance UI labels have complete seven-locale coverage', () => {
  for (const locale of locales) {
    assert.deepEqual(Object.keys(financeUiDictionaries[locale]).sort(), [...requiredKeys].sort())
    for (const key of requiredKeys) assert.ok(financeUiDictionaries[locale][key]?.trim(), `${locale}:${key}`)
  }
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
  for (const route of ['income', 'transactions']) {
    const source = readFileSync(new URL(`../app/(app)/${route}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /FinanceSelectionBar/)
    assert.match(source, /selection=\{/)
  }
})

test('finance search is case-insensitive and ignores empty optional fields', () => {
  assert.equal(matchesFinanceSearch('  CHAT  ', ['ChatGPT Plus', null, undefined]), true)
  assert.equal(matchesFinanceSearch('software', ['ChatGPT Plus', 'Subscription', 'Software']), true)
  assert.equal(matchesFinanceSearch('fuel', ['ChatGPT Plus', null, 'Software']), false)
  assert.equal(matchesFinanceSearch('  ', [null]), true)
})
