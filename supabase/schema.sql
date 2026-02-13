-- Troop to Task: Supabase Schema
-- Run this in the Supabase SQL editor

create extension if not exists "uuid-ossp";

-- ============================================================
-- Auth / Multi-tenant tables
-- ============================================================

-- Organizations (multi-tenant root)
create table public.organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

-- Organization memberships (users <-> organizations)
create type public.organization_role as enum ('owner', 'member');

create table public.organization_memberships (
  id          uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.organization_role not null default 'member',
  invited_by  uuid references auth.users(id),
  -- Granular permissions (owners always have full access regardless of these values)
  can_view_calendar boolean not null default true,
  can_edit_calendar boolean not null default true,
  can_view_personnel boolean not null default true,
  can_edit_personnel boolean not null default true,
  can_view_training boolean not null default true,
  can_edit_training boolean not null default true,
  can_manage_members boolean not null default false,
  created_at  timestamptz not null default now(),
  unique(organization_id, user_id)
);

-- Organization invitations (pending email invites)
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.organization_invitations (
  id          uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  invited_by  uuid not null references auth.users(id),
  status      public.invitation_status not null default 'pending',
  -- Default permissions for invited member
  can_view_calendar boolean not null default true,
  can_edit_calendar boolean not null default true,
  can_view_personnel boolean not null default true,
  can_edit_personnel boolean not null default true,
  can_view_training boolean not null default true,
  can_edit_training boolean not null default true,
  can_manage_members boolean not null default false,
  created_at  timestamptz not null default now(),
  unique(organization_id, email)
);

-- ============================================================
-- Domain tables (scoped to organization)
-- ============================================================

create table public.groups (
  id          uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique(organization_id, name)
);

create table public.personnel (
  id          uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  rank        text not null,
  last_name   text not null,
  first_name  text not null,
  mos         text not null default '',
  clinic_role text not null default '',
  group_id    uuid references public.groups(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.status_types (
  id          uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  color       text not null default '#6b7280',
  text_color  text not null default '#ffffff',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.availability_entries (
  id              uuid primary key default uuid_generate_v4(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  personnel_id    uuid not null references public.personnel(id) on delete cascade,
  status_type_id  uuid not null references public.status_types(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  created_at      timestamptz not null default now(),
  constraint valid_date_range check (end_date >= start_date)
);

create table public.special_days (
  id          uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  date        date not null,
  name        text not null,
  type        text not null check (type in ('federal-holiday', 'org-closure')),
  created_at  timestamptz not null default now()
);

create table public.assignment_types (
  id          uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  short_name  text not null,
  assign_to   text not null check (assign_to in ('personnel', 'group')),
  color       text not null default '#6b7280',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.daily_assignments (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  assignment_type_id  uuid not null references public.assignment_types(id) on delete cascade,
  date                date not null,
  assignee_id         text not null,
  created_at          timestamptz not null default now(),
  unique(organization_id, assignment_type_id, date)
);

-- Per-user per-organization pinned groups preference
create table public.user_pinned_groups (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  group_name  text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique(user_id, organization_id, group_name)
);

-- ============================================================
-- Registration Invites (invite-only signup)
-- ============================================================

create table public.registration_invites (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  email       text,  -- optional: restrict to specific email
  used_by     uuid references auth.users(id),
  used_at     timestamptz,
  expires_at  timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index idx_registration_invites_code on public.registration_invites(code);

-- ============================================================
-- Indexes
-- ============================================================

create index idx_organization_memberships_user on public.organization_memberships(user_id);
create index idx_organization_memberships_org on public.organization_memberships(organization_id);
create index idx_personnel_org on public.personnel(organization_id);
create index idx_personnel_group on public.personnel(group_id);
create index idx_groups_org on public.groups(organization_id);
create index idx_status_types_org on public.status_types(organization_id);
create index idx_availability_org on public.availability_entries(organization_id);
create index idx_availability_personnel on public.availability_entries(personnel_id);
create index idx_special_days_org on public.special_days(organization_id);
create index idx_assignment_types_org on public.assignment_types(organization_id);
create index idx_daily_assignments_org on public.daily_assignments(organization_id);
create index idx_daily_assignments_date on public.daily_assignments(date);
create index idx_user_pinned_groups_user_org on public.user_pinned_groups(user_id, organization_id);
create index idx_organization_invitations_email on public.organization_invitations(email);

-- ============================================================
-- Training & Certification tables
-- ============================================================

create table public.training_types (
  id                    uuid primary key default uuid_generate_v4(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  name                  text not null,
  description           text,
  expiration_months     integer,  -- null = never expires
  warning_days_yellow   integer not null default 60,
  warning_days_orange   integer not null default 30,
  required_for_roles    text[] not null default '{}',  -- empty = optional for all
  color                 text not null default '#6b7280',
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  unique(organization_id, name)
);

create table public.personnel_trainings (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  personnel_id        uuid not null references public.personnel(id) on delete cascade,
  training_type_id    uuid not null references public.training_types(id) on delete cascade,
  completion_date     date,  -- NULL allowed for never-expires training when marked complete without date
  expiration_date     date,  -- calculated from completion + expiration_months
  notes               text,
  certificate_url     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(organization_id, personnel_id, training_type_id)
);

create index idx_training_types_org on public.training_types(organization_id);
create index idx_personnel_trainings_org on public.personnel_trainings(organization_id);
create index idx_personnel_trainings_personnel on public.personnel_trainings(personnel_id);
create index idx_personnel_trainings_type on public.personnel_trainings(training_type_id);
create index idx_personnel_trainings_expiration on public.personnel_trainings(expiration_date);
