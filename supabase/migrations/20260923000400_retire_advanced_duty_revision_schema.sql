-- The advanced snapshot/revision model has no retained Calendar consumer.
-- Drop the typed-return RPC before its table, then child tables before parents.
-- Leave legacy event and Calendar generation relations for the next cutovers.
DROP FUNCTION public.replace_advanced_duty_run_snapshot(uuid, text, jsonb);

DROP TABLE public.advanced_duty_revision_slot_changes;
DROP TABLE public.advanced_duty_revision_change_sets;
DROP TABLE public.advanced_duty_revision_drafts;
DROP TABLE public.advanced_duty_run_snapshots;

DROP FUNCTION public.advanced_duty_revision_actor_can_manage(uuid);
DROP FUNCTION public.apply_advanced_duty_revision(uuid, uuid, jsonb, jsonb, jsonb, jsonb, timestamp with time zone);
DROP FUNCTION public.update_advanced_duty_event_aggregate(uuid, uuid, jsonb, jsonb);
DROP FUNCTION public.update_advanced_duty_template_aggregate(uuid, uuid, jsonb, jsonb, jsonb);
