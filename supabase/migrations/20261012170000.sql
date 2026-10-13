-- Edit 1 (2026-10-12): durable order acknowledgement and bounded push escalation.
-- Additive only. The existing event row remains the durable verified order event;
-- push delivery is a separate status and never controls event persistence.

alter table public.incoming_order_alert_events
  add column if not exists acknowledgement_status text not null default 'new'
    check (acknowledgement_status in ('new', 'notified', 'seen', 'acknowledged')),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references auth.users(id) on delete set null,
  add column if not exists push_attempt_count integer not null default 0
    check (push_attempt_count between 0 and 3),
  add column if not exists next_push_attempt_at timestamptz,
  add column if not exists push_claimed_until timestamptz,
  add column if not exists last_push_attempt_at timestamptz;

alter table public.order_notification_settings
  add column if not exists foreground_sound_volume numeric not null default 0.7
    check (foreground_sound_volume >= 0 and foreground_sound_volume <= 1),
  add column if not exists last_test_at timestamptz,
  add column if not exists last_test_status text
    check (last_test_status in ('request_accepted', 'failed'));

create index if not exists incoming_order_alert_events_escalation_idx
  on public.incoming_order_alert_events(next_push_attempt_at)
  where acknowledgement_status <> 'acknowledged' and push_attempt_count < 3;

comment on column public.incoming_order_alert_events.acknowledgement_status is
  'Human workflow state; provider acceptance is represented separately by notification_status.';
comment on column public.incoming_order_alert_events.push_attempt_count is
  'Bounded total push attempts per event, including the initial attempt; maximum 3.';

-- Verification (read-only):
-- select column_name, data_type, column_default from information_schema.columns
-- where table_schema='public' and table_name='incoming_order_alert_events'
-- and column_name in ('acknowledgement_status','acknowledged_at','acknowledged_by',
-- 'push_attempt_count','next_push_attempt_at','push_claimed_until','last_push_attempt_at');
-- select column_name from information_schema.columns where table_schema='public'
-- and table_name='order_notification_settings' and column_name='foreground_sound_volume';
-- select column_name from information_schema.columns where table_schema='public'
-- and table_name='order_notification_settings' and column_name in ('last_test_at','last_test_status');
-- select indexname, indexdef from pg_indexes where schemaname='public'
-- and tablename='incoming_order_alert_events' and indexname='incoming_order_alert_events_escalation_idx';

-- Rollback notes: deploy code that no longer reads these columns first; then remove
-- the partial index and added columns manually. No existing event/order rows are deleted.
