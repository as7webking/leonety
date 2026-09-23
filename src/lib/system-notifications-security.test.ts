import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const settingsRoute = readFileSync(new URL('../app/api/notifications/route.ts', import.meta.url), 'utf8')
const testRoute = readFileSync(new URL('../app/api/notifications/test/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../supabase/migrations/20260920153440_incoming_order_notifications.sql', import.meta.url), 'utf8')

test('authorizes every notification operation against the authenticated workspace owner', () => {
  assert.match(settingsRoute, /requireOwnedCompany\(parsed\.data\.companyId\)/)
  assert.match(testRoute, /requireOwnedCompany\(parsed\.data\.companyId\)/)
  assert.doesNotMatch(settingsRoute, /service_role|SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(testRoute, /service_role|SUPABASE_SERVICE_ROLE_KEY/)
})

test('scopes current-device operations by workspace, authenticated user and installation id', () => {
  for (const source of [settingsRoute, testRoute]) {
    assert.match(source, /\.eq\('company_id', parsed\.data\.companyId\)/)
    assert.match(source, /\.eq\('user_id', auth\.user\.id\)/)
    assert.match(source, /\.eq\('installation_id', parsed\.data\.installationId\)/)
  }
})

test('reuses private server-only push storage rather than adding public subscriptions', () => {
  assert.match(migration, /revoke all on public\.order_notification_devices from anon, authenticated/)
  assert.match(migration, /push_endpoint text not null/)
  assert.match(migration, /push_p256dh text not null/)
  assert.match(migration, /push_auth text not null/)
  assert.doesNotMatch(settingsRoute, /NEXT_PUBLIC_.*PRIVATE|push_endpoint.*NextResponse/)
})
