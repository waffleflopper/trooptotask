-- Rating scheme entries: tracks who rates whom and evaluation timelines
create table public.rating_scheme_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rated_person_id uuid not null references public.personnel(id) on delete cascade,
  eval_type text not null check (eval_type in ('OER', 'NCOER', 'WOER')),
  rater_person_id uuid references public.personnel(id) on delete set null,
  rater_name text,
  senior_rater_person_id uuid references public.personnel(id) on delete set null,
  senior_rater_name text,
  intermediate_rater_person_id uuid references public.personnel(id) on delete set null,
  intermediate_rater_name text,
  reviewer_person_id uuid references public.personnel(id) on delete set null,
  reviewer_name text,
  rating_period_start date not null,
  rating_period_end date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'change-of-rater')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rating_scheme_entries_org_idx on public.rating_scheme_entries(organization_id);
create index rating_scheme_entries_rated_idx on public.rating_scheme_entries(rated_person_id);

-- Updated_at trigger
create trigger update_rating_scheme_entries_updated_at
  before update on public.rating_scheme_entries
  for each row execute function update_updated_at_column();

-- RLS
alter table public.rating_scheme_entries enable row level security;

create policy "Org members can view rating scheme"
  on public.rating_scheme_entries for select
  using (public.can_view_personnel(organization_id));

create policy "Org editors can manage rating scheme"
  on public.rating_scheme_entries for all
  using (public.can_edit_personnel(organization_id));
