import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { resolveWebPushViewStatus } from './web-push-client.ts'

const supported = { supported: true, iosInstallRequired: false, secureContextRequired: false }

test('reports actual permission and current-device subscription states', () => {
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'default', browserSubscribed: false }), 'permissionRequired')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'denied', browserSubscribed: false }), 'blocked')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: false, serverStatus: 'enabled' }), 'notEnabled')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'disabled' }), 'notEnabled')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'invalid' }), 'notEnabled')
  assert.equal(resolveWebPushViewStatus({ capability: supported, permission: 'granted', browserSubscribed: true, serverStatus: 'enabled' }), 'enabled')
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
  }), 'unsupported')
})
