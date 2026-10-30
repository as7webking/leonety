import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const client = readFileSync(resolve(process.cwd(), 'src/components/mail/mail-client.tsx'), 'utf8')
const settings = readFileSync(resolve(process.cwd(), 'src/components/mail/mailbox-settings.tsx'), 'utf8')
const savedTestRoute = readFileSync(resolve(process.cwd(), 'src/app/api/mail/connections/[connectionId]/test/route.ts'), 'utf8')
const connectionsRoute = readFileSync(resolve(process.cwd(), 'src/app/api/mail/connections/[connectionId]/route.ts'), 'utf8')
const actionsRoute = readFileSync(resolve(process.cwd(), 'src/app/api/mail/actions/route.ts'), 'utf8')
const server = readFileSync(resolve(process.cwd(), 'src/lib/mailbox/server.ts'), 'utf8')
const plan = readFileSync(resolve(process.cwd(), 'src/lib/mailbox-plan.ts'), 'utf8')
const oauthStart = readFileSync(resolve(process.cwd(), 'src/app/api/mail/oauth/[provider]/start/route.ts'), 'utf8')
const oauthCallback = readFileSync(resolve(process.cwd(), 'src/app/api/mail/oauth/[provider]/callback/route.ts'), 'utf8')
const imapConnect = readFileSync(resolve(process.cwd(), 'src/app/api/mail/connections/route.ts'), 'utf8')
const imapTest = readFileSync(resolve(process.cwd(), 'src/app/api/mail/connections/test/route.ts'), 'utf8')

test('Mail shows default and last successful connection, with a selectable default', () => {
  assert.match(client, /defaultMailboxId === item\.id[\s\S]*?mail\.defaultMailbox/)
  assert.match(client, /item\.lastSuccessfulConnectionAt[\s\S]*?mail\.lastConnection/)
  assert.match(client, /writeBrowserDefaultMailboxId\(key, id\)/)
})

test('verified Leonety email CTA points to provider choices without implying mailbox access', () => {
  assert.match(settings, /data\.canonicalVerifiedEmail[\s\S]*?mail\.accountEmailNotConnected[\s\S]*?mail\.connectMailbox/)
  assert.match(settings, /beginAccountEmailConnection/)
  assert.match(settings, /accountEmailConnection && <Button asChild[\s\S]*?\/app\/mail\?mailbox=/)
  assert.match(settings, /id="mailbox-connect-options"/)
  assert.match(settings, /mail\.accountEmailNote/)
  assert.match(settings, /mail\.openInbox/)
})

test('account-email OAuth intent is bound to server-verified identity and checked before connection persistence', () => {
  assert.match(oauthStart, /getVerifiedCanonicalAuthEmail\(user\)/)
  assert.match(oauthStart, /expectedAccountEmail: canonicalEmail/)
  assert.match(oauthCallback, /state\.expectedAccountEmail[\s\S]*?mailboxEmailsMatch[\s\S]*?return fail\('account_email_mismatch'\)/)
  assert.match(imapConnect, /input\.accountEmailOnly[\s\S]*?mailboxEmailMatchesCanonical\(user, input\.email\)/)
  assert.match(imapTest, /input\.accountEmailOnly[\s\S]*?mailboxEmailMatchesCanonical\(user, input\.email\)/)
})

test('saved IMAP connection can be tested and reactivated after a transient connection error', () => {
  assert.match(settings, /connection\.provider === 'imap'[\s\S]*?reconnect_required[\s\S]*?testSaved\(connection\)/)
  assert.match(savedTestRoute, /new ImapSmtpMailboxProvider\(connection\)/)
  assert.match(savedTestRoute, /status: 'connected', last_successful_connection_at/)
  assert.match(savedTestRoute, /status: code === 'reconnect_required' \|\| code === 'missing_scope' \? 'reconnect_required' : 'error'/)
})

test('mark read/unread synchronizes the cached message row using connection/provider/message identity', () => {
  assert.match(client, /item\.connectionId === message\.connectionId && item\.provider === message\.provider && item\.providerMessageId === message\.providerMessageId[\s\S]*?\{ \.\.\.item, isRead \}/)
})

test('server enforces mailbox counts and current plan limits', () => {
  assert.match(server, /create_mailbox_connection_limited/)
  assert.match(connectionsRoute, /activate_mailbox_connection_limited/)
  assert.match(plan, /case 'free': return 1[\s\S]*?case 'starter': return 2[\s\S]*?case 'pro':[\s\S]*?return 4/)
})

test('send and mark-read actions require an owned workspace and connected mailbox', () => {
  assert.match(actionsRoute, /requireOwnedMailboxWorkspace/)
  assert.match(actionsRoute, /connection\.status !== 'connected'/)
  assert.match(actionsRoute, /getMailboxEntitlement/)
})

