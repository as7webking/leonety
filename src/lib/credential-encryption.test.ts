import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as moduleApi from 'node:module'
import { test } from 'node:test'

const registerHooks = (moduleApi as unknown as {
  registerHooks(hooks: {
    resolve(
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => { url: string },
    ): { url: string; shortCircuit?: boolean }
  }): void
}).registerHooks

registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => { url: string }) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const encryption = await import(new URL('./credential-encryption.ts', import.meta.url).href)

test('credential format detection preserves legacy data and rejects malformed encrypted claims', () => {
  assert.equal(encryption.classifySecretFormat('legacy-token-value'), 'LEGACY_PLAINTEXT_OR_LEGACY_FORMAT')
  assert.equal(encryption.classifySecretFormat('enc:v1:broken'), 'INVALID_ENCRYPTED_VALUE')
  assert.equal(encryption.classifySecretFormat('enc:v2:opaque'), 'INVALID_ENCRYPTED_VALUE')
  assert.equal(encryption.isEncryptedSecret('enc:v1:broken'), true)
})

test('new credentials round-trip using the authenticated current format', () => {
  process.env.LEONETY_CREDENTIAL_ENCRYPTION_KEY = 'test-key-with-more-than-thirty-two-characters'
  const secret = 'credential-that-must-never-be-logged-or-returned-on-failure'
  const encrypted = encryption.encryptSecret(secret)

  assert.match(encrypted, /^enc:v1:/)
  assert.equal(encryption.classifySecretFormat(encrypted), 'CURRENT_ENCRYPTED')
  assert.equal(encryption.decryptSecret(encrypted), secret)
  assert.equal(encryption.decryptSecret('legacy-token-value'), 'legacy-token-value')
})

test('malformed, tampered, wrong-key and missing-key ciphertext fail without revealing credentials', () => {
  const originalKey = process.env.LEONETY_CREDENTIAL_ENCRYPTION_KEY
  const secret = 'highly-sensitive-refresh-token'
  process.env.LEONETY_CREDENTIAL_ENCRYPTION_KEY = 'test-key-with-more-than-thirty-two-characters'
  const encrypted = encryption.encryptSecret(secret)
  const [, , iv, tag, payload] = encrypted.split(':')
  const tampered = `enc:v1:${iv}:${tag.slice(0, -1)}${tag.endsWith('A') ? 'B' : 'A'}:${payload}`
  const failures = [
    () => encryption.decryptSecret('enc:v1:malformed'),
    () => encryption.decryptSecret(tampered),
  ]

  process.env.LEONETY_CREDENTIAL_ENCRYPTION_KEY = 'a-different-encryption-key-with-adequate-length'
  failures.push(() => encryption.decryptSecret(encrypted))
  delete process.env.LEONETY_CREDENTIAL_ENCRYPTION_KEY
  failures.push(() => encryption.decryptSecret(encrypted))

  for (const fail of failures) {
    assert.throws(fail, (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message.includes(secret), false)
      assert.equal(error.message.includes(encrypted), false)
      return true
    })
  }

  if (originalKey) process.env.LEONETY_CREDENTIAL_ENCRYPTION_KEY = originalKey
  else delete process.env.LEONETY_CREDENTIAL_ENCRYPTION_KEY
})

test('mailbox and integration credential creation, reconnect and refresh paths encrypt before persistence', async () => {
  const [mailboxServer, mailboxProvider, mailboxRoute, mailboxOAuth, storeRoute, storeOAuth, wooRoute, webhookRoute] = await Promise.all([
    readFile(new URL('./mailbox/server.ts', import.meta.url), 'utf8'),
    readFile(new URL('./mailbox/provider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/mail/connections/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/mail/oauth/[provider]/callback/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/store-integrations/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/store-integrations/oauth/callback/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/woocommerce/connection/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/order-notifications/webhook/route.ts', import.meta.url), 'utf8'),
  ])

  assert.match(mailboxServer, /p_access_token_encrypted:\s*input\.accessToken\s*\?\s*encryptSecret/)
  assert.match(mailboxServer, /p_refresh_token_encrypted:\s*input\.refreshToken\s*\?\s*encryptSecret/)
  assert.match(mailboxRoute, /encryptMailboxConfig\(config\)/)
  assert.match(mailboxOAuth, /createLimitedMailboxConnection\(/)
  assert.match(mailboxOAuth, /accessToken:\s*tokens\.accessToken/)
  assert.match(mailboxOAuth, /refreshToken,/) // New and reconnect tokens pass through the encrypted RPC helper.
  assert.match(mailboxProvider, /access_token_encrypted:\s*encryptSecret/)
  assert.match(mailboxProvider, /refresh_token_encrypted:\s*encryptSecret/)
  assert.match(storeRoute, /return encryptSecret\(nextValue\)/)
  assert.match(storeOAuth, /access_token:\s*tokens\.accessToken\s*\?\s*encryptSecret/)
  assert.match(storeOAuth, /refresh_token:\s*tokens\.refreshToken\s*\?\s*encryptSecret/)
  assert.match(wooRoute, /consumer_key:\s*consumerKey\s*\?\s*encryptSecret/)
  assert.match(wooRoute, /consumer_secret:\s*consumerSecret\s*\?\s*encryptSecret/)
  assert.match(webhookRoute, /order_webhook_secret:\s*encryptSecret\(secret\)/)
})
