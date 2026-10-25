BEGIN;

-- Banner writes move to server commands that bind attribution and await the audit row.
DROP POLICY "Operators can delete announcements" ON public.platform_announcements;
DROP POLICY "Operators can insert announcements" ON public.platform_announcements;
DROP POLICY "Operators can update announcements" ON public.platform_announcements;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.platform_announcements FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_announcement_dismissal_counts()
RETURNS TABLE (announcement_id uuid, dismissal_count bigint)
LANGUAGE sql STABLE SET search_path = '' AS $$
	SELECT d.announcement_id, pg_catalog.count(*) FROM public.announcement_dismissals d GROUP BY d.announcement_id;
$$;
REVOKE ALL ON FUNCTION public.platform_announcement_dismissal_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_announcement_dismissal_counts() TO service_role;

COMMIT;
