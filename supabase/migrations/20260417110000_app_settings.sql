-- App settings table: stores admin-managed key/value configuration (API keys, etc.)
-- Values are stored as text. Sensitive values should be treated as secrets by the application.
-- Only admin users can read or write these via RLS.

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.app_settings is
  'Admin-managed application configuration key/value pairs (API keys, integration URLs, etc.)';

-- RLS: only admin role can read/write
alter table public.app_settings enable row level security;

create policy "Admin read app_settings"
  on public.app_settings for select
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin write app_settings"
  on public.app_settings for all
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Seed the known setting keys with empty values so they always exist
insert into public.app_settings (key, value)
values
  ('action_network_api_key', ''),
  ('yabbr_api_key', ''),
  ('yabbr_api_url', '')
on conflict (key) do nothing;
