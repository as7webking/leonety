-- Private, workspace-isolated employee document metadata and Storage bucket.
-- Additive/idempotent. Review and execute manually after employee profile migrations.

create table if not exists public.employee_document_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_type text not null,
  name text not null,
  country_code text,
  job_role text,
  is_required boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint employee_document_requirements_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint employee_document_requirements_type_unique unique (employee_id, document_type)
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  requirement_id uuid references public.employee_document_requirements(id) on delete set null,
  document_type text not null,
  display_name text not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  issue_date date,
  expiration_date date,
  document_reference text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_documents_dates_check check (expiration_date is null or issue_date is null or expiration_date >= issue_date),
  constraint employee_documents_type_unique unique (employee_id, document_type)
);

create table if not exists public.employee_document_settings (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  has_driving_licence boolean,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists employee_documents_company_employee_idx on public.employee_documents(company_id, employee_id, updated_at desc);
create index if not exists employee_documents_expiration_idx on public.employee_documents(company_id, expiration_date) where expiration_date is not null;
create index if not exists employee_document_requirements_employee_idx on public.employee_document_requirements(company_id, employee_id);

alter table public.employee_documents enable row level security;
alter table public.employee_document_requirements enable row level security;
alter table public.employee_document_settings enable row level security;

do $$
declare
  table_name text;
  owner_expression text;
begin
  foreach table_name in array array['employee_documents', 'employee_document_requirements', 'employee_document_settings'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_all') then
      owner_expression := format(
        'exists (select 1 from public.companies c where c.id = %1$I.company_id and c.owner_id = auth.uid()) and exists (select 1 from public.employees e where e.id = %1$I.employee_id and e.company_id = %1$I.company_id)',
        table_name
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
        table_name || '_owner_all', table_name, owner_expression, owner_expression
      );
    end if;
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-documents', 'employee-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_select') then
    create policy employee_documents_storage_owner_select on storage.objects for select to authenticated
    using (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_insert') then
    create policy employee_documents_storage_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_update') then
    create policy employee_documents_storage_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()))
    with check (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_delete') then
    create policy employee_documents_storage_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
end $$;

-- Read-only verification after manual execution:
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'employee-documents';
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename like 'employee_document%';
-- select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'employee_documents_storage%';
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.employee_documents'::regclass, 'public.employee_document_requirements'::regclass, 'public.employee_document_settings'::regclass);

-- Rollback: deploy code that no longer reads these tables first, export metadata/files, then remove policies,
-- bucket objects, bucket and tables manually. Never drop these objects after production uploads without an export.
