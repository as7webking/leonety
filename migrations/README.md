# Database migration archive

This directory is an archive of SQL files that were historically applied through
the Supabase SQL Editor. It is **not** a replayable Supabase CLI migration chain.

## Production safety

- Do not run every file in this directory against an existing database.
- Do not rerun `fix_auth_and_rls.sql`. It is a legacy bootstrap script that replaces
  the signup trigger and recreates user-scoped policies from before workspaces were
  introduced.
- Do not run both `20260615_operations_inventory.sql` and
  `20260615_operations_inventory_compact.sql`. They are alternative versions of the
  same inventory foundation.
- Do not run `20260905_inventory_accounting_links.sql` until the live type of
  `public.expenses.id` has been verified. That file declares a `bigint` reference,
  while the current schema snapshot and application types use `uuid`.
- `test_setup.sql` contains inspection queries only. It is not a migration.
- `migration.sql` and `src/lib/schema.sql` are historical snapshots, not executable
  production migrations.

The linked production project currently has no rows in
`supabase_migrations.schema_migrations`, even though the public schema contains the
later application tables. This indicates that schema changes were applied manually.
Deleting, renaming, replaying, or marking these files as applied would therefore be
unsafe without comparing each file with the live catalog first.

## Baseline strategy

1. Keep this archive unchanged for production history and incident investigation.
2. Export the live `public` schema after installing Docker or Podman:

   ```bash
   npx supabase db dump --linked --schema public --file supabase/baselines/CURRENT_SCHEMA_BASELINE.sql
   ```

3. Review the dump for grants, policies, functions, triggers, extensions, and any
   accidental data statements. Do not include `auth` schema objects or row data.
4. Store the reviewed baseline under `supabase/baselines/`; do not place it in
   `supabase/migrations/` and do not run it against production.
5. Put only future, forward-only changes in `supabase/migrations/` using unique
   14-digit timestamps, for example
   `supabase/migrations/20260913153000_add_example_index.sql`.
6. Apply each future migration once with `supabase db push`, then verify the remote
   migration list and application behavior.

Do not use `supabase migration repair` to claim that this archive was applied. Repair
is appropriate only for a specific version whose exact SQL effect has independently
been proven to match production.

## Read-only verification

Run the queries in `docs/database/PERFORMANCE_INSPECTION.sql` through the Supabase SQL
Editor. They inspect identifiers, foreign-key types, policies, indexes, and query
plans without changing schema or data.
