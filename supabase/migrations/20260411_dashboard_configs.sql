-- Dashboard widget layout config per user per org
create table public.dashboard_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  config jsonb not null default '{"widgets":[],"version":1}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id, org_id)
);

alter table public.dashboard_configs enable row level security;

create policy "Users can read their own dashboard config"
  on public.dashboard_configs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own dashboard config"
  on public.dashboard_configs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own dashboard config"
  on public.dashboard_configs for update
  using (auth.uid() = user_id);

-- Touch updated_at on every write
create or replace function public.touch_dashboard_config_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger dashboard_configs_updated_at
  before update on public.dashboard_configs
  for each row execute function public.touch_dashboard_config_updated_at();
