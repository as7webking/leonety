-- Protect finalized contract content and its version history at the database boundary.
-- This migration is additive: it creates/replaces triggers and functions only.
-- It does not rewrite contracts, versions, policies, grants, or historical snapshots.

create or replace function public.guard_contract_finalized_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or old.finalized_at is not null then
      raise exception 'Finalized or archived contracts cannot be deleted'
        using errcode = '55000';
    end if;
    return old;
  end if;

  -- Status or timestamp tampering must not reopen a previously finalized row.
  if old.status <> 'draft' or old.finalized_at is not null then
    if new.status = 'draft' then
      raise exception 'Finalized contracts cannot return to draft'
        using errcode = '55000';
    end if;

    if old.status = 'archived' and new.status <> 'archived' then
      raise exception 'Archived contracts cannot be reopened'
        using errcode = '55000';
    end if;

    if old.status = 'finalized' and new.status not in ('finalized', 'archived') then
      raise exception 'Invalid finalized contract status transition'
        using errcode = '55000';
    end if;

    if old.status = 'draft' and new.status not in ('finalized', 'archived') then
      raise exception 'A draft with a finalization timestamp cannot be reopened'
        using errcode = '55000';
    end if;

    -- Only the lifecycle status and database-managed timestamps may change.
    if (to_jsonb(new) - array['status', 'updated_at', 'archived_at'])
      is distinct from
       (to_jsonb(old) - array['status', 'updated_at', 'archived_at']) then
      raise exception 'Finalized contract content is immutable'
        using errcode = '55000';
    end if;

    new.finalized_at := old.finalized_at;
    if new.status = 'archived' then
      new.archived_at := coalesce(old.archived_at, pg_catalog.now());
    else
      new.archived_at := old.archived_at;
    end if;
    return new;
  end if;

  -- Draft content remains editable. Finalization time is database-authored;
  -- archival remains an allowed existing transition, including for drafts.
  if new.status = 'finalized' then
    new.finalized_at := pg_catalog.now();
    new.archived_at := null;
  elsif new.status = 'archived' then
    new.finalized_at := null;
    new.archived_at := coalesce(old.archived_at, pg_catalog.now());
  else
    new.finalized_at := old.finalized_at;
    new.archived_at := old.archived_at;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_contract_finalized_immutability on public.contracts;
create trigger trg_guard_contract_finalized_immutability
before update or delete on public.contracts
for each row
execute function public.guard_contract_finalized_immutability();

create or replace function public.guard_contract_version_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  parent_status text;
  parent_finalized_at timestamptz;
  parent_found boolean;
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.contract_id is distinct from old.contract_id
    or new.company_id is distinct from old.company_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Contract version identity and audit fields are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    select c.status, c.finalized_at
      into parent_status, parent_finalized_at
    from public.contracts c
    where c.id = old.contract_id
      and c.company_id = old.company_id
    for update;

    if not found then
      -- A draft contract may be deleted and cascade its draft versions.
      if pg_catalog.pg_trigger_depth() > 1 then return old; end if;
      raise exception 'Contract version parent was not found'
        using errcode = '23503';
    end if;

    if parent_status <> 'draft' or parent_finalized_at is not null then
      raise exception 'Versions of finalized or archived contracts cannot be deleted'
        using errcode = '55000';
    end if;
    return old;
  end if;

  select c.status, c.finalized_at
    into parent_status, parent_finalized_at
  from public.contracts c
  where c.id = new.contract_id
    and c.company_id = new.company_id
  for update;

  parent_found := found;
  if not parent_found then
    raise exception 'Contract version must reference a contract in the same workspace'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE'
    and (parent_status <> 'draft' or parent_finalized_at is not null) then
    raise exception 'Versions of finalized or archived contracts are immutable'
      using errcode = '55000';
  end if;

  if new.version_kind = 'draft' and parent_status <> 'draft' then
    raise exception 'Draft versions require a draft contract'
      using errcode = '23514';
  end if;

  if new.version_kind = 'finalized' and parent_status not in ('finalized', 'archived') then
    raise exception 'Finalized versions require a finalized contract'
      using errcode = '23514';
  end if;

  if new.version_kind in ('draft', 'finalized') and (
    new.title is distinct from (select c.title from public.contracts c where c.id = new.contract_id)
    or new.generated_document is distinct from (select c.generated_document from public.contracts c where c.id = new.contract_id)
  ) then
    raise exception 'Contract version snapshot must match the saved contract document'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_contract_version_immutability on public.contract_versions;
create trigger trg_guard_contract_version_immutability
before insert or update or delete on public.contract_versions
for each row
execute function public.guard_contract_version_immutability();

comment on function public.guard_contract_finalized_immutability() is
  'Keeps finalized and archived contract content immutable while allowing the established finalized-to-archived transition.';
comment on function public.guard_contract_version_immutability() is
  'Keeps finalized contract versions immutable and validates version workspace and saved document consistency.';

-- Post-deployment verification (run manually after approval/application):
-- select c.relname, t.tgname, pg_get_triggerdef(t.oid, true)
-- from pg_trigger t join pg_class c on c.oid = t.tgrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname in ('contracts', 'contract_versions')
--   and not t.tgisinternal;
