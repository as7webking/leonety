import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../../supabase/migrations/20261126190000.sql', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/addons/route.ts', import.meta.url), 'utf8')
const registry = readFileSync(new URL('./addons/registry.ts', import.meta.url), 'utf8')

test('addon migration is reproducible but fails closed on incompatible existing schema', () => {
  assert.match(migration, /to_regclass\('public\.workspace_addon_activations'\)/)
  assert.match(migration, /if activation_table is null then\s+create table public\.workspace_addon_activations/)
  assert.match(migration, /actual_column_count <> 6/)
  assert.match(migration, /actual_constraint_count <> 4/)
  assert.match(migration, /schema mismatch; inspect production metadata/)
  assert.doesNotMatch(migration, /create table if not exists/i)
})

test('addon persistence migration preserves workspace scoping and default-disabled activation', () => {
  assert.match(migration, /enabled boolean not null default false/i)
  assert.match(migration, /primary key \(company_id, addon_id\)/i)
  assert.match(migration, /companies\(id\) on delete cascade/i)
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/i)
  assert.match(migration, /updated_by = \(select auth\.uid\(\)\)/i)
  assert.match(registry, /defaultEnabled: false/)
})

test('upsert has the grants it needs while activation identity and direct deletion stay protected', () => {
  assert.match(api, /\.upsert\([\s\S]*onConflict: 'company_id,addon_id'/)
  assert.match(migration, /grant insert \(company_id, addon_id, enabled\)/i)
  assert.match(migration, /grant update \(company_id, addon_id, enabled\)/i)
  assert.match(migration, /new\.company_id is distinct from old\.company_id[\s\S]*new\.addon_id is distinct from old\.addon_id/)
  assert.match(migration, /workspace addon activation identity is immutable/i)
  assert.doesNotMatch(migration, /grant\s+delete/i)
  assert.doesNotMatch(migration, /create policy[^;]+for delete/i)
})

test('migration keeps activation state workspace-specific and does not activate planned Kassenbuch', () => {
  assert.match(migration, /primary key \(company_id, addon_id\)/i)
  assert.match(registry, /id: 'kassenbuch-de'[\s\S]*defaultEnabled: false/)
  assert.match(registry, /status: 'planned'[\s\S]*route: null/)
})
