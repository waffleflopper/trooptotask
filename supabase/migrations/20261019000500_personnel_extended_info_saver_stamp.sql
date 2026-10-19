-- The Data sheet's "saved by" caption names the member who wrote the row. A signed-in writer's own
-- user id replaces whatever updated_by they send, so a direct API write cannot name someone else.
-- Writes without a signed-in user (service role, maintenance) keep the value they supply.
-- Acknowledging an award touches no sheet field, so it leaves the saver as it was.
BEGIN;

CREATE FUNCTION public.stamp_personnel_extended_info_saver() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND to_jsonb(NEW) - ARRAY['award_tracking_acknowledged_at', 'updated_at']
         = to_jsonb(OLD) - ARRAY['award_tracking_acknowledged_at', 'updated_at'] THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid()::text;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_personnel_extended_info_saver() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_personnel_extended_info_saver
BEFORE INSERT OR UPDATE ON public.personnel_extended_info
FOR EACH ROW EXECUTE FUNCTION public.stamp_personnel_extended_info_saver();

COMMIT;
