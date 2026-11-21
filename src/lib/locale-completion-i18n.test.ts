import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { localeCompletionDictionaries } from './locale-completion-i18n.ts'

const interpolations: Record<string, string[]> = {
  'transactions.bulkMatches': ['count'],
  'transactions.bulkRenameDone': ['count'],
  'transactions.selectedCount': ['count'],
  'transactions.bulkSelectedDone': ['count'],
  'income.pageDescription': ['workspace'],
  'income.latestRate': ['from', 'rate', 'to'],
  'expenses.pageDescription': ['workspace'],
  'expenses.latestRate': ['from', 'rate', 'to'],
  'profile.currentPlanInline': ['plan'],
}

function tokens(value: string) {
  return [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort()
}

test('completed locale strings are non-empty and retain interpolation tokens', () => {
  for (const [locale, entries] of Object.entries(localeCompletionDictionaries)) {
    for (const [key, value] of Object.entries(entries ?? {})) {
      assert.ok(value.trim(), `${locale} has an empty translation for ${key}`)
      if (interpolations[key]) assert.deepEqual(tokens(value), interpolations[key], `${locale}.${key} changed its placeholders`)
    }
  }
})
