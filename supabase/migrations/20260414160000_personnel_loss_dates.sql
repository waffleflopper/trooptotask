alter table public.personnel
	add column if not exists ets date,
	add column if not exists deros date;
