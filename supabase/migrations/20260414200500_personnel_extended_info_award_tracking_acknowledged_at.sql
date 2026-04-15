alter table public.personnel_extended_info
add column if not exists award_tracking_acknowledged_at timestamptz;
