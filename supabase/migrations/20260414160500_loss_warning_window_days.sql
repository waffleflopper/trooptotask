alter table public.organizations
  add column if not exists loss_warning_window_days integer;

update public.organizations
set loss_warning_window_days = 180
where loss_warning_window_days is null;

alter table public.organizations
  alter column loss_warning_window_days set default 180;

alter table public.organizations
  alter column loss_warning_window_days set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_loss_warning_window_days_check'
  ) then
    alter table public.organizations
      add constraint organizations_loss_warning_window_days_check
      check (loss_warning_window_days between 1 and 365);
  end if;
end
$$;
