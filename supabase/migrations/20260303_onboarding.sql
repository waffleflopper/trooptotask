-- Onboarding feature: template steps, personnel onboardings, and step progress

-- onboarding_template_steps: org-level onboarding checklist definition
create table public.onboarding_template_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  step_type text not null check (step_type in ('training', 'paperwork', 'checkbox')),
  training_type_id uuid references public.training_types(id) on delete set null,
  stages jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index onboarding_template_steps_org_idx on public.onboarding_template_steps(organization_id);

alter table public.onboarding_template_steps enable row level security;

create policy "Org members can view onboarding template steps"
  on public.onboarding_template_steps for select
  using (public.can_view_personnel(organization_id));

create policy "Org editors can manage onboarding template steps"
  on public.onboarding_template_steps for all
  using (public.can_edit_personnel(organization_id));

-- personnel_onboardings: enrolls a person in the onboarding process
create table public.personnel_onboardings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  started_at date not null default current_date,
  completed_at date,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create unique index personnel_onboardings_active_idx
  on public.personnel_onboardings(organization_id, personnel_id)
  where status = 'in_progress';

create index personnel_onboardings_org_idx on public.personnel_onboardings(organization_id);

alter table public.personnel_onboardings enable row level security;

create policy "Org members can view onboardings"
  on public.personnel_onboardings for select
  using (public.can_view_personnel(organization_id));

create policy "Org editors can manage onboardings"
  on public.personnel_onboardings for all
  using (public.can_edit_personnel(organization_id));

-- onboarding_step_progress: per-person progress on each step (snapshotted from template)
create table public.onboarding_step_progress (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.personnel_onboardings(id) on delete cascade,
  step_name text not null,
  step_type text not null check (step_type in ('training', 'paperwork', 'checkbox')),
  training_type_id uuid references public.training_types(id) on delete set null,
  stages jsonb,
  sort_order int not null default 0,
  completed boolean not null default false,
  current_stage text,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index onboarding_step_progress_onboarding_idx on public.onboarding_step_progress(onboarding_id);

alter table public.onboarding_step_progress enable row level security;

create policy "Org members can view step progress"
  on public.onboarding_step_progress for select
  using (
    exists (
      select 1 from public.personnel_onboardings po
      where po.id = onboarding_step_progress.onboarding_id
      and public.can_view_personnel(po.organization_id)
    )
  );

create policy "Org editors can manage step progress"
  on public.onboarding_step_progress for all
  using (
    exists (
      select 1 from public.personnel_onboardings po
      where po.id = onboarding_step_progress.onboarding_id
      and public.can_edit_personnel(po.organization_id)
    )
  );
