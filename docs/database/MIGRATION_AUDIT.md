# Leonety migration audit

Audit date: 2026-09-13

## Status

- Historical SQL is stored in `migrations/`, not in the Supabase CLI directory
  `supabase/migrations/`.
- The linked production migration list is empty, while the live public schema contains
  tables from later feature work. Production therefore appears to have been changed
  through manually executed SQL rather than tracked CLI migrations.
- A trustworthy current baseline could not be generated during the audit because
  `supabase db dump` requires Docker or Podman and neither runtime is installed.
- No historical file was deleted, renamed, replayed, or marked as applied.

## Conflicts

1. `fix_auth_and_rls.sql` and `src/lib/schema.sql` define `incomes.id`,
   `expenses.id`, and `time_entries.id` as `bigint`; `migration.sql`, current
   TypeScript types, and newer relationship migrations expect UUID identifiers.
2. `20260905_inventory_accounting_links.sql` declares
   `stock_movements.linked_expense_id bigint`, which conflicts with the UUID expense
   identifier in the current snapshot. Verify the live catalog before any corrective
   migration.
3. `20260615_operations_inventory.sql` and
   `20260615_operations_inventory_compact.sql` create the same tables, policies,
   indexes, and stock RPC with different definitions. They are alternatives, not a
   safe sequential pair.
4. The active-timer files repeatedly replace pause, resume, and stop functions with
   different signatures. Their final state depends on application order. Lexical
   filename order also places `20260415_active_timers_pause_and_limit.sql` before
   `20260415_active_timers_workspace.sql`, so a fresh alphabetical replay would try
   to alter `active_timers` before creating it.
5. The production schema contains entities not represented by the available archive,
   including invoice payments and AI chat tables. The archive cannot reconstruct a
   fresh environment by itself.

## Baseline decision

Do not create or execute `CURRENT_SCHEMA_BASELINE.sql` from the historical files.
Generate it from the linked live database, review it, and use it only for fresh
installations. Production must keep its existing objects and data untouched.

## Index decision

Production currently has 12 client rows and an actively used
`clients_company_id_idx`. There is no evidence yet that an additional partial index
for `(company_id, name) where status <> 'inactive'` would improve real latency. Run
the supplied `EXPLAIN (ANALYZE, BUFFERS)` after replacing the example UUID. Revisit
the index when the client table is materially larger or the plan shows an expensive
sort/scan.

## Repository observations

- No tracked `.bak`, `.old`, `.orig`, temporary screenshot, or editor backup files
  were found.
- `.DS_Store`, `.env.local`, `.next`, `node_modules`, and Supabase CLI temporary
  state are ignored and untracked.
- Old setup documents still mention the legacy bootstrap script. Treat those guides
  as historical until they are consolidated in a separate documentation task.
