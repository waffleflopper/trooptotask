-- Troop to Task: Row Level Security Policies
-- Run this AFTER schema.sql in the Supabase SQL editor

-- ============================================================
-- Helper function
-- ============================================================

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner(p_organization_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ============================================================
-- Page-level permission helper functions
-- ============================================================

-- Calendar permissions (availability, assignments, special_days, status_types, assignment_types)
create or replace function public.can_view_calendar(p_organization_id uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
    and user_id = auth.uid()
    and (role = 'owner' or can_view_calendar = true)
  );
end;
$$;

create or replace function public.can_edit_calendar(p_organization_id uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
    and user_id = auth.uid()
    and (role = 'owner' or can_edit_calendar = true)
  );
end;
$$;

-- Personnel permissions (personnel, groups)
create or replace function public.can_view_personnel(p_organization_id uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
    and user_id = auth.uid()
    and (role = 'owner' or can_view_personnel = true)
  );
end;
$$;

create or replace function public.can_edit_personnel(p_organization_id uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
    and user_id = auth.uid()
    and (role = 'owner' or can_edit_personnel = true)
  );
end;
$$;

-- Training permissions (training_types, personnel_trainings)
create or replace function public.can_view_training(p_organization_id uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
    and user_id = auth.uid()
    and (role = 'owner' or can_view_training = true)
  );
end;
$$;

create or replace function public.can_edit_training(p_organization_id uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
    and user_id = auth.uid()
    and (role = 'owner' or can_edit_training = true)
  );
end;
$$;

-- Member management permission
create or replace function public.can_manage_org_members(p_organization_id uuid)
returns boolean language plpgsql security definer stable as $$
begin
  return exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id
    and user_id = auth.uid()
    and (role = 'owner' or can_manage_members = true)
  );
end;
$$;

-- ============================================================
-- Organization creation function (creates org + owner membership atomically)
-- ============================================================

create or replace function public.create_org_with_owner(p_name text)
returns uuid language plpgsql security definer as $$
declare
  v_org_id uuid;
begin
  -- Create the organization
  insert into public.organizations (name, created_by)
  values (p_name, auth.uid())
  returning id into v_org_id;

  -- Create the owner membership
  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    can_view_calendar,
    can_edit_calendar,
    can_view_personnel,
    can_edit_personnel,
    can_view_training,
    can_edit_training,
    can_manage_members
  ) values (
    v_org_id,
    auth.uid(),
    'owner',
    true,
    true,
    true,
    true,
    true,
    true,
    true
  );

  return v_org_id;
end;
$$;

-- ============================================================
-- Ownership transfer function
-- ============================================================

create or replace function public.transfer_org_ownership(
  p_organization_id uuid,
  p_new_owner_id uuid
) returns void language plpgsql security definer as $$
begin
  -- Verify caller is current owner
  if not public.is_org_owner(p_organization_id) then
    raise exception 'Only the owner can transfer ownership';
  end if;

  -- Verify new owner is a member
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_new_owner_id
  ) then
    raise exception 'New owner must be an existing member';
  end if;

  -- Demote current owner to admin member (keeps full permissions)
  update public.organization_memberships
  set role = 'member',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  where organization_id = p_organization_id and user_id = auth.uid();

  -- Promote new owner
  update public.organization_memberships
  set role = 'owner',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  where organization_id = p_organization_id and user_id = p_new_owner_id;
end;
$$;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.groups enable row level security;
alter table public.personnel enable row level security;
alter table public.status_types enable row level security;
alter table public.availability_entries enable row level security;
alter table public.special_days enable row level security;
alter table public.assignment_types enable row level security;
alter table public.daily_assignments enable row level security;
alter table public.user_pinned_groups enable row level security;
alter table public.registration_invites enable row level security;

-- ============================================================
-- Registration Invites
-- ============================================================

-- Anyone can read invites (needed for validation during signup)
create policy "Anyone can validate invite codes"
  on public.registration_invites for select
  using (true);

-- Only authenticated users can create invites (admin feature)
create policy "Authenticated users can create invites"
  on public.registration_invites for insert
  with check (auth.uid() is not null);

-- Anyone can update invites (to mark as used during signup)
create policy "Anyone can mark invites as used"
  on public.registration_invites for update
  using (true);

-- Users can delete their own unused invites
create policy "Users can delete their own invites"
  on public.registration_invites for delete
  using (auth.uid() = created_by and used_by is null);

-- ============================================================
-- Organizations
-- ============================================================

create policy "Users can view organizations they are members of"
  on public.organizations for select
  using (public.is_org_member(id));

-- Allow any authenticated user to create an organization where they are the creator
create policy "Authenticated users can create organizations"
  on public.organizations for insert
  with check (auth.uid() is not null and auth.uid() = created_by);

create policy "Organization owners can update their organizations"
  on public.organizations for update
  using (public.is_org_owner(id));

create policy "Organization owners can delete their organizations"
  on public.organizations for delete
  using (public.is_org_owner(id));

-- ============================================================
-- Organization Memberships
-- ============================================================

create policy "Members can view memberships of their organizations"
  on public.organization_memberships for select
  using (public.is_org_member(organization_id));

-- Allow users to add themselves as owner to organizations they created
create policy "Creators and owners can insert memberships"
  on public.organization_memberships for insert
  with check (
    auth.uid() is not null and (
      public.is_org_owner(organization_id)
      or (user_id = auth.uid() and exists (
        select 1 from public.organizations where id = organization_id and created_by = auth.uid()
      ))
    )
  );

create policy "Admins can delete memberships"
  on public.organization_memberships for delete
  using (public.can_manage_org_members(organization_id));

create policy "Admins can update memberships"
  on public.organization_memberships for update
  using (public.can_manage_org_members(organization_id));

-- ============================================================
-- Organization Invitations
-- ============================================================

create policy "Members can view invitations for their organizations"
  on public.organization_invitations for select
  using (public.is_org_member(organization_id));

create policy "Admins can create invitations"
  on public.organization_invitations for insert
  with check (public.can_manage_org_members(organization_id));

create policy "Admins can update invitations"
  on public.organization_invitations for update
  using (public.can_manage_org_members(organization_id));

-- ============================================================
-- Organization-scoped tables - Creator can also insert during org setup
-- ============================================================

-- Groups
create policy "Members can view groups" on public.groups
  for select using (public.is_org_member(organization_id));
create policy "Members and creators can insert groups" on public.groups
  for insert with check (
    public.is_org_member(organization_id)
    or exists (select 1 from public.organizations where id = organization_id and created_by = auth.uid())
  );
create policy "Members can update groups" on public.groups
  for update using (public.is_org_member(organization_id));
create policy "Members can delete groups" on public.groups
  for delete using (public.is_org_member(organization_id));

-- Personnel
create policy "Members can view personnel" on public.personnel
  for select using (public.is_org_member(organization_id));
create policy "Members can insert personnel" on public.personnel
  for insert with check (public.is_org_member(organization_id));
create policy "Members can update personnel" on public.personnel
  for update using (public.is_org_member(organization_id));
create policy "Members can delete personnel" on public.personnel
  for delete using (public.is_org_member(organization_id));

-- Status Types
create policy "Members can view status types" on public.status_types
  for select using (public.is_org_member(organization_id));
create policy "Members and creators can insert status types" on public.status_types
  for insert with check (
    public.is_org_member(organization_id)
    or exists (select 1 from public.organizations where id = organization_id and created_by = auth.uid())
  );
create policy "Members can update status types" on public.status_types
  for update using (public.is_org_member(organization_id));
create policy "Members can delete status types" on public.status_types
  for delete using (public.is_org_member(organization_id));

-- Availability Entries
create policy "Members can view availability" on public.availability_entries
  for select using (public.is_org_member(organization_id));
create policy "Members can insert availability" on public.availability_entries
  for insert with check (public.is_org_member(organization_id));
create policy "Members can update availability" on public.availability_entries
  for update using (public.is_org_member(organization_id));
create policy "Members can delete availability" on public.availability_entries
  for delete using (public.is_org_member(organization_id));

-- Special Days
create policy "Members can view special days" on public.special_days
  for select using (public.is_org_member(organization_id));
create policy "Members and creators can insert special days" on public.special_days
  for insert with check (
    public.is_org_member(organization_id)
    or exists (select 1 from public.organizations where id = organization_id and created_by = auth.uid())
  );
create policy "Members can update special days" on public.special_days
  for update using (public.is_org_member(organization_id));
create policy "Members can delete special days" on public.special_days
  for delete using (public.is_org_member(organization_id));

-- Assignment Types
create policy "Members can view assignment types" on public.assignment_types
  for select using (public.is_org_member(organization_id));
create policy "Members and creators can insert assignment types" on public.assignment_types
  for insert with check (
    public.is_org_member(organization_id)
    or exists (select 1 from public.organizations where id = organization_id and created_by = auth.uid())
  );
create policy "Members can update assignment types" on public.assignment_types
  for update using (public.is_org_member(organization_id));
create policy "Members can delete assignment types" on public.assignment_types
  for delete using (public.is_org_member(organization_id));

-- Daily Assignments
create policy "Members can view daily assignments" on public.daily_assignments
  for select using (public.is_org_member(organization_id));
create policy "Members can insert daily assignments" on public.daily_assignments
  for insert with check (public.is_org_member(organization_id));
create policy "Members can update daily assignments" on public.daily_assignments
  for update using (public.is_org_member(organization_id));
create policy "Members can delete daily assignments" on public.daily_assignments
  for delete using (public.is_org_member(organization_id));

-- ============================================================
-- User Pinned Groups (per-user preference)
-- ============================================================

create policy "Users can view their own pinned groups"
  on public.user_pinned_groups for select
  using (auth.uid() = user_id and public.is_org_member(organization_id));

create policy "Users can insert their own pinned groups"
  on public.user_pinned_groups for insert
  with check (auth.uid() = user_id and public.is_org_member(organization_id));

create policy "Users can update their own pinned groups"
  on public.user_pinned_groups for update
  using (auth.uid() = user_id and public.is_org_member(organization_id));

create policy "Users can delete their own pinned groups"
  on public.user_pinned_groups for delete
  using (auth.uid() = user_id and public.is_org_member(organization_id));

-- ============================================================
-- Training Types
-- ============================================================

alter table public.training_types enable row level security;

create policy "Members can view training types" on public.training_types
  for select using (public.is_org_member(organization_id));
create policy "Members and creators can insert training types" on public.training_types
  for insert with check (
    public.is_org_member(organization_id)
    or exists (select 1 from public.organizations where id = organization_id and created_by = auth.uid())
  );
create policy "Members can update training types" on public.training_types
  for update using (public.is_org_member(organization_id));
create policy "Members can delete training types" on public.training_types
  for delete using (public.is_org_member(organization_id));

-- ============================================================
-- Personnel Trainings
-- ============================================================

alter table public.personnel_trainings enable row level security;

create policy "Members can view personnel trainings" on public.personnel_trainings
  for select using (public.is_org_member(organization_id));
create policy "Members can insert personnel trainings" on public.personnel_trainings
  for insert with check (public.is_org_member(organization_id));
create policy "Members can update personnel trainings" on public.personnel_trainings
  for update using (public.is_org_member(organization_id));
create policy "Members can delete personnel trainings" on public.personnel_trainings
  for delete using (public.is_org_member(organization_id));
