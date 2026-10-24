import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyGmailConnectFailure, classifyGmailProviderError } from './mailbox/gmail-failure.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyGoogleApiFailure } from './mailbox/google-errors.ts'

test('Gmail connection stages map to distinct safe diagnostic categories', () => {
  assert.equal(classifyGmailConnectFailure('configuration'), 'oauth_configuration')
  assert.equal(classifyGmailConnectFailure('consent'), 'consent_denied')
  assert.equal(classifyGmailConnectFailure('callback'), 'callback_failed')
  assert.equal(classifyGmailConnectFailure('token_exchange'), 'token_exchange_failed')
  assert.equal(classifyGmailConnectFailure('token_storage'), 'token_storage_failed')
  assert.equal(classifyGmailConnectFailure('mailbox_identity'), 'mailbox_identity_failed')
  assert.equal(classifyGmailConnectFailure('gmail_api'), 'gmail_api_failed')
  assert.equal(classifyGmailConnectFailure('token_refresh'), 'token_refresh_failed')
  assert.equal(classifyGmailConnectFailure('token_exchange', 'missing_scope'), 'missing_scope')
  assert.equal(classifyGmailConnectFailure('token_refresh', 'authorization_expired'), 'reconnect_required')
  assert.equal(classifyGmailConnectFailure('token_exchange', 'oauth_configuration'), 'oauth_configuration')
  assert.equal(classifyGmailProviderError('access_denied'), 'consent_denied')
  assert.equal(classifyGmailProviderError('redirect_uri_mismatch'), 'oauth_configuration')
  assert.equal(classifyGmailProviderError('unknown_provider_error'), 'callback_failed')
})

test('Gmail API failures stay distinct from revoked authorization and missing scope', () => {
  assert.equal(classifyGoogleApiFailure(401, null), 'reconnect_required')
  assert.equal(classifyGoogleApiFailure(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }), 'missing_scope')
  assert.equal(classifyGoogleApiFailure(403, { error: { message: 'policy denied' } }), 'gmail_api_failed')
  assert.equal(classifyGoogleApiFailure(429, null), 'gmail_api_failed')
  assert.equal(classifyGoogleApiFailure(503, null), 'gmail_api_failed')
})
