-- Leonety database inspection only.
-- Every statement in this file is read-only. Review the result before proposing DDL.

-- 1. Choose a real workspace UUID for scoped query-plan checks.
select id, name
from public.companies
order by name;

-- Replace REAL_UUID_HERE with one UUID returned by the query above before execution.
explain (analyze, buffers)
select id, name, email, phone, status, created_at
from public.clients
where company_id = 'REAL_UUID_HERE'::uuid
  and status <> 'inactive'
order by name
limit 20;

-- 2. Exact column types for workspace-scoped entities and relationship columns.
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'clients',
    'companies',
    'products',
    'expenses',
    'incomes',
    'stock_movements',
    'invoices',
    'contracts',
    'time_entries'
  )
  and (
    c.column_name = 'id'
    or c.column_name = 'company_id'
    or c.column_name like '%\_id' escape '\'
  )
order by c.table_name, c.ordinal_position;

-- 3. Foreign keys whose source and target PostgreSQL types differ.
select
  src_ns.nspname || '.' || src.relname as source_table,
  src_col.attname as source_column,
  format_type(src_col.atttypid, src_col.atttypmod) as source_type,
  dst_ns.nspname || '.' || dst.relname as target_table,
  dst_col.attname as target_column,
  format_type(dst_col.atttypid, dst_col.atttypmod) as target_type,
  con.conname as constraint_name
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class dst on dst.oid = con.confrelid
join pg_namespace dst_ns on dst_ns.oid = dst.relnamespace
join lateral unnest(con.conkey) with ordinality src_key(attnum, ord) on true
join lateral unnest(con.confkey) with ordinality dst_key(attnum, ord)
  on dst_key.ord = src_key.ord
join pg_attribute src_col on src_col.attrelid = src.oid and src_col.attnum = src_key.attnum
join pg_attribute dst_col on dst_col.attrelid = dst.oid and dst_col.attnum = dst_key.attnum
where con.contype = 'f'
  and src_ns.nspname = 'public'
  and src_col.atttypid <> dst_col.atttypid
order by source_table, constraint_name, src_key.ord;

-- 4. Existing indexes relevant to client filtering and ordering.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clients'
order by indexname;

-- 5. Table/index cardinality and usage. Reset timestamps make zero scans ambiguous.
select
  s.relname as table_name,
  s.n_live_tup as estimated_rows,
  s.seq_scan,
  s.idx_scan,
  pg_size_pretty(pg_total_relation_size(s.relid)) as total_size,
  stats.stats_reset
from pg_stat_user_tables s
cross join lateral (select stats_reset from pg_stat_database where datname = current_database()) stats
where s.relname in (
  'clients',
  'companies',
  'products',
  'expenses',
  'incomes',
  'stock_movements',
  'invoices',
  'contracts',
  'time_entries'
)
order by pg_total_relation_size(s.relid) desc;

-- 6. RLS state and policy expressions for application tables.
select
  t.schemaname,
  t.tablename,
  t.rowsecurity,
  c.relforcerowsecurity as force_rowsecurity,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
from pg_tables t
join pg_namespace n on n.nspname = t.schemaname
join pg_class c on c.relnamespace = n.oid and c.relname = t.tablename
left join pg_policies p
  on p.schemaname = t.schemaname
 and p.tablename = t.tablename
where t.schemaname = 'public'
order by t.tablename, p.policyname;

-- 7. Large text values that may indicate base64/data-URL product images.
select
  count(*) filter (where image_url like 'data:%') as data_url_rows,
  max(length(image_url)) as longest_image_url
from public.products;

-- 8. Duplicate index definitions on the same table and ordered columns.
select
  schemaname,
  tablename,
  regexp_replace(indexdef, '^create (unique )?index [^ ]+ ', '', 'i') as normalized_definition,
  array_agg(indexname order by indexname) as index_names,
  count(*) as duplicate_count
from pg_indexes
where schemaname = 'public'
group by schemaname, tablename, normalized_definition
having count(*) > 1
order by tablename, normalized_definition;
