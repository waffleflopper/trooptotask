-- Access Requests: allow potential users to request invite codes
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  invite_id uuid references public.registration_invites(id),
  created_at timestamptz not null default now()
);

-- Only one pending request per email
create unique index access_requests_pending_email_idx
  on public.access_requests (lower(email))
  where status = 'pending';

-- RLS: only platform admins can read/write
alter table public.access_requests enable row level security;

create policy "Platform admins can manage access requests"
  on public.access_requests for all
  using (public.is_platform_admin());
