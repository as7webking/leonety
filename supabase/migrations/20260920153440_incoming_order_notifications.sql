-- Incoming order alerts: one explicitly selected Web Push device per workspace.
-- Additive and idempotent. Review manually; do not apply through the application.

alter table public.woocommerce_connections
  add column if not exists order_webhook_secret text,
  add column if not exists order_webhook_configured_at timestamptz;

create table if not exists public.order_notification_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  device_label text not null check (char_length(device_label) between 1 and 80),
  platform text not null check (char_length(platform) between 1 and 40),
  locale text not null default 'en' check (locale in ('en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr')),
  push_endpoint text not null,
  push_p256dh text not null,
  push_auth text not null,
  status text not null default 'enabled' check (status in ('enabled', 'invalid', 'disabled')),
  last_seen_at timestamptz not null default now(),
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_notification_devices_company_installation_unique unique (company_id, installation_id),
  constraint order_notification_devices_company_id_id_unique unique (company_id, id)
);

create table if not exists public.order_notification_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  active_device_id uuid,
  enabled boolean not null default false,
  foreground_sound_enabled boolean not null default true,
  foreground_sound_path text,
  foreground_sound_name text,
  foreground_sound_mime text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_notification_settings_active_device_fkey
    foreign key (company_id, active_device_id)
    references public.order_notification_devices(company_id, id)
    on delete set null (active_device_id)
);

create table if not exists public.incoming_order_alert_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  external_order_id text not null,
  event_type text not null default 'order.created',
  provider_delivery_id text,
  order_number text,
  amount text,
  currency text,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'skipped', 'failed')),
  notification_error_code text,
  notified_device_id uuid references public.order_notification_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint incoming_order_alert_events_dedup_unique
    unique (company_id, provider, external_order_id, event_type)
);

create index if not exists order_notification_devices_company_status_idx
  on public.order_notification_devices(company_id, status);
create index if not exists incoming_order_alert_events_company_created_idx
  on public.incoming_order_alert_events(company_id, created_at desc);

alter table public.order_notification_devices enable row level security;
alter table public.order_notification_settings enable row level security;
alter table public.incoming_order_alert_events enable row level security;

-- Push endpoints and key material are intentionally server-only. Authenticated users
-- configure them through routes that first verify companies.owner_id.
revoke all on public.order_notification_devices from anon, authenticated;
revoke all on public.order_notification_settings from anon, authenticated;
revoke all on public.incoming_order_alert_events from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-alert-sounds', 'order-alert-sounds', false, 2097152, array['audio/mpeg', 'audio/wav', 'audio/x-wav'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are added: upload/read/delete use server routes after
-- workspace-owner authorization and signed URLs are short-lived.

-- Verification (read-only):
-- select table_name from information_schema.tables
-- where table_schema = 'public' and table_name like 'order_notification%';
-- select table_name from information_schema.tables
-- where table_schema = 'public' and table_name = 'incoming_order_alert_events';
-- select id, public, file_size_limit from storage.buckets where id = 'order-alert-sounds';

-- Rollback guidance: disable the feature in code first. Preserve alert event history;
-- no destructive rollback is included.
