import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../../supabase/migrations/20261126180000.sql', import.meta.url),
  'utf8',
)

test('contract immutability migration keeps draft editing and the archive transition explicit', () => {
  assert.match(migration, /before update or delete on public\.contracts/i)
  assert.match(migration, /old\.status <> 'draft' or old\.finalized_at is not null/i)
  assert.match(migration, /new\.status not in \('finalized', 'archived'\)/i)
  assert.match(migration, /new\.status = 'archived'[\s\S]*?coalesce\(old\.archived_at, pg_catalog\.now\(\)\)/i)
  assert.match(migration, /new\.finalized_at := pg_catalog\.now\(\)/i)
})

test('contract version migration prevents finalized-version mutation and validates parent workspace', () => {
  assert.match(migration, /before insert or update or delete on public\.contract_versions/i)
  assert.match(migration, /where c\.id = old\.contract_id[\s\S]*?for update/i)
  assert.match(migration, /where c\.id = new\.contract_id[\s\S]*?and c\.company_id = new\.company_id[\s\S]*?for update/i)
  assert.match(migration, /Versions of finalized or archived contracts are immutable/i)
  assert.match(migration, /Contract version snapshot must match the saved contract document/i)
})

test('contract immutability migration does not alter policies, grants, or historical rows', () => {
  assert.doesNotMatch(migration, /\b(alter table|create policy|drop policy|grant|revoke|update public\.|delete from public\.)\b/i)
})
