import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { resolveWebPushViewStatus } from './web-push-client.ts'

const supported = { supported: true, iosInstallRequired: false, secureContextRequired: false }

test('reports actual permission and current-device subscription states', () => {
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'default', browserSubscribed: false }), 'permissionRequired')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'denied', browserSubscribed: false }), 'blocked')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: false, serverStatus: 'enabled' }), 'subscriptionMissing')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'disabled' }), 'notEnabled')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'invalid' }), 'error')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'enabled' }), 'enabled')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'default', browserSubscribed: false, serverConfigured: false }), 'serverConfigurationMissing')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'denied', browserSubscribed: false, serverConfigured: false }), 'blocked')
})

test('reports invalid server registrations and failed state loading as errors', () => {
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'invalid' }), 'error')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'enabled', loadFailed: true }), 'error')
})

test('does not claim Web Push support for unsupported browsers or non-installed iOS web apps', () => {
  assert.equal(resolveWebPushViewStatus({
    capability: { supported: false, iosInstallRequired: false, secureContextRequired: false },
    permission: 'default',
    browserSubscribed: false,
  }), 'unsupported')
  assert.equal(resolveWebPushViewStatus({
    capability: { supported: true, iosInstallRequired: true, secureContextRequired: false },
    permission: 'granted',
    browserSubscribed: true,
    serverStatus: 'enabled',
  }), 'installationRequired')
})
