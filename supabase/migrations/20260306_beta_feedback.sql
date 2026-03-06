-- Beta feedback table for collecting bug reports and feature requests from beta testers

create table public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  category text not null default 'general' check (category in ('bug', 'feature', 'general')),
  message text not null,
  page_url text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_beta_feedback_user_id on public.beta_feedback(user_id);
create index idx_beta_feedback_status on public.beta_feedback(status);
create index idx_beta_feedback_created_at on public.beta_feedback(created_at desc);

-- RLS
alter table public.beta_feedback enable row level security;

-- Users can insert their own feedback
create policy "Users can insert own feedback"
  on public.beta_feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can view their own feedback
create policy "Users can view own feedback"
  on public.beta_feedback for select
  to authenticated
  using (auth.uid() = user_id);

-- Platform admins have full access
create policy "Admins full access"
  on public.beta_feedback for all
  to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

-- Updated_at trigger
create trigger set_beta_feedback_updated_at
  before update on public.beta_feedback
  for each row
  execute function update_updated_at_column();
