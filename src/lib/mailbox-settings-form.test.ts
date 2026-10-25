import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { mailboxDictionaries } from './mailbox-i18n.ts'

const source = readFileSync(new URL('../components/mail/mailbox-settings.tsx', import.meta.url), 'utf8')
const imapProvider = readFileSync(new URL('./mailbox/imap-provider.ts', import.meta.url), 'utf8')
const connectionRoute = readFileSync(new URL('../app/api/mail/connections/route.ts', import.meta.url), 'utf8')

test('custom mailbox form puts mailbox credentials before incoming/outgoing server settings', () => {
  const email = source.indexOf("t('mail.imap.email')")
  const senderName = source.indexOf("t('mail.imap.displayName')")
  const password = source.indexOf("t('mail.imap.password')")
  const incoming = source.indexOf("t('mail.imap.incoming')")
  const outgoing = source.indexOf("t('mail.imap.outgoing')")
  assert.ok(email < senderName && senderName < password && password < incoming && incoming < outgoing)
})

test('custom login is hidden in native collapsed advanced settings and Gmail OAuth stays separate', () => {
  const details = source.indexOf('<details className="rounded-md border px-3 py-2">')
  const summary = source.indexOf("t('mail.imap.advanced')", details)
  const username = source.indexOf("t('mail.imap.customUsername')", details)
  const closeDetails = source.indexOf('</details>', details)
  assert.ok(details >= 0 && details < summary && summary < username && username < closeDetails)
  assert.match(source, /connectOAuth\('google'\)/)
  assert.match(source, /t\('mail\.connectGoogle'\)/)
})

test('IMAP and SMTP authenticate with the same configured login and responses omit credentials', () => {
  assert.equal((imapProvider.match(/auth: \{ user: config\.username, pass: config\.password \}/g) ?? []).length, 2)
  assert.match(imapProvider, /from: \{ name: cleanHeader\(this\.config\.displayName \|\| this\.config\.address\), address: this\.config\.address \}/)
  assert.match(connectionRoute, /const encryptedConfig = encryptMailboxConfig\(config\)/)
  assert.match(connectionRoute, /NextResponse\.json\(\{ id, connected: true \}/)
  assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem).*password/i)
})

test('mailbox form labels are localized in all supported languages', () => {
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    const dictionary = mailboxDictionaries[locale]
    for (const key of ['mail.imap.mailbox', 'mail.imap.incoming', 'mail.imap.outgoing', 'mail.imap.advanced', 'mail.imap.customUsername', 'mail.imap.usernameHelp', 'mail.imap.displayNameHelp']) {
      assert.ok(dictionary[key as keyof typeof dictionary], `${locale} missing ${key}`)
    }
  }
})
