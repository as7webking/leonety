import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { mailboxLimitForPlan } from './mailbox-plan.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { mailboxDictionaries } from './mailbox-i18n.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { isMailboxRelatedHost } from './mailbox/host-scope.ts'

test('mailbox allowances follow the canonical plan mapping', () => {
  assert.equal(mailboxLimitForPlan('free'), 1)
  assert.equal(mailboxLimitForPlan('starter'), 2) // Leonety's canonical Starter is the requested Basic tier.
  assert.equal(mailboxLimitForPlan('pro'), 4)
  assert.equal(mailboxLimitForPlan('business'), 4)
})

test('mailbox system strings are complete in all supported locales', () => {
  const expected = Object.keys(mailboxDictionaries.en).sort()
  for (const locale of ['de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    assert.deepEqual(Object.keys(mailboxDictionaries[locale]).sort(), expected, `${locale} mailbox strings`)
  }
})

test('generic mailbox hosts are scoped to the account domain or its MX provider', () => {
  assert.equal(isMailboxRelatedHost('imap.example.com', 'example.com', []), true)
  assert.equal(isMailboxRelatedHost('imap.provider.net', 'shop.example.com', ['mx1.provider.net']), true)
  assert.equal(isMailboxRelatedHost('imap.other.net', 'shop.example.com', ['mx1.provider.net']), false)
  assert.equal(isMailboxRelatedHost('imap.co.uk', 'example.co.uk', ['mx1.provider.co.uk']), false)
})
