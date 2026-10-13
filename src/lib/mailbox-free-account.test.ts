import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { freeMailboxIdentityError, getVerifiedCanonicalAuthEmail } from './mailbox/free-account.ts'

const oauthCallback = readFileSync(new URL('../app/api/mail/oauth/[provider]/callback/route.ts', import.meta.url), 'utf8')
const oauthStart = readFileSync(new URL('../app/api/mail/oauth/[provider]/start/route.ts', import.meta.url), 'utf8')
const imapConnections = readFileSync(new URL('../app/api/mail/connections/route.ts', import.meta.url), 'utf8')
const imapTest = readFileSync(new URL('../app/api/mail/connections/test/route.ts', import.meta.url), 'utf8')
const mailboxUi = readFileSync(new URL('../components/mail/mailbox-settings.tsx', import.meta.url), 'utf8')
const workspaceApi = readFileSync(new URL('../app/api/workspaces/route.ts', import.meta.url), 'utf8')
const workspaceTrigger = readFileSync(new URL('../../supabase/migrations/20260919205522.sql', import.meta.url), 'utf8')

test('Free mailbox identity requires the canonical confirmed Supabase auth email', () => {
  const verified = { email: ' User@Example.com ', email_confirmed_at: '2026-01-01T00:00:00Z' }
  assert.equal(getVerifiedCanonicalAuthEmail(verified), 'user@example.com')
  assert.equal(getVerifiedCanonicalAuthEmail({ email: 'user@example.com' }), null)
  assert.equal(getVerifiedCanonicalAuthEmail({ email: 'user@example.com' }), null)
  assert.equal(freeMailboxIdentityError('free', verified, 'USER@example.com'), null)
  assert.equal(freeMailboxIdentityError('free', verified, 'business@example.com'), 'free_email_mismatch')
  assert.equal(freeMailboxIdentityError('free', { email: null }, 'user@example.com'), 'free_email_required')
  assert.equal(freeMailboxIdentityError('starter', { email: null }, 'business@example.com'), null)
  assert.equal(freeMailboxIdentityError('pro', { email: null }, 'business@example.com'), null)
})

test('OAuth Free policy runs before provider redirect and before saving the returned identity', () => {
  assert.match(oauthStart, /!entitlement\.freeEmailReady[\s\S]*free_email_required/)
  assert.match(oauthCallback, /freeMailboxIdentityError\(entitlement\.plan, user, identity\.email\)/)
  assert.ok(oauthCallback.indexOf('identityRestriction = freeMailboxIdentityError') < oauthCallback.indexOf('await createLimitedMailboxConnection({'))
})

test('Generic IMAP and its test endpoint enforce the same Free identity rule server-side', () => {
  assert.match(imapConnections, /freeMailboxIdentityError\(entitlement\.plan, user, input\.email\)/)
  assert.match(imapTest, /freeMailboxIdentityError\(entitlement\.plan, user, input\.email\)/)
  assert.match(mailboxUi, /data\.plan !== 'free' \|\| data\.freeEmailReady/)
  assert.match(mailboxUi, /mail\.freeEmailRequired/)
})

test('Workspace creation is authorized server-side and the database guard protects direct inserts', () => {
  assert.match(workspaceApi, /resolveAccountAccessForUser\(user\.id, user\.email\)/)
  assert.match(workspaceApi, /canCreateWorkspace\(resolved\.workspaceCount, resolved\.accountAccess\)/)
  assert.match(workspaceTrigger, /trg_enforce_workspace_entitlement_limit/)
  assert.match(workspaceTrigger, /workspace_count >= workspace_limit/)
})
