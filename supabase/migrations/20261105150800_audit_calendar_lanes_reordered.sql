-- #1999 A reorder of the Calendar lanes is audited by the database in the same transaction as the change, so a failed
-- entry fails the reorder and a retry cannot lose it. Showing or hiding a lane moves positions without changing the
-- order of the lanes that stay, and writes nothing here.
BEGIN;

CREATE FUNCTION audit_private.audit_calendar_lanes_reordered() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_kept integer;
  v_moved boolean;
BEGIN
  FOR v_organization_id IN
    SELECT DISTINCT n.organization_id
    FROM new_rows AS n
    JOIN old_rows AS o ON o.id = n.id
    WHERE n.sort_order IS DISTINCT FROM o.sort_order
      OR n.show_on_calendar IS DISTINCT FROM o.show_on_calendar
      OR (n.archived_at IS NULL) IS DISTINCT FROM (o.archived_at IS NULL)
    ORDER BY n.organization_id
  LOOP
    IF NOT audit_private.unit_exists(v_organization_id) THEN
      CONTINUE;
    END IF;
    -- A row outside the statement kept its state, so the table holds its before and after alike.
    WITH before_lanes AS (
      SELECT o.id, o.sort_order FROM old_rows AS o
      WHERE o.organization_id = v_organization_id AND o.show_on_calendar AND o.archived_at IS NULL
      UNION ALL
      SELECT t.id, t.sort_order FROM public.assignment_types AS t
      WHERE t.organization_id = v_organization_id AND t.show_on_calendar AND t.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM old_rows AS o WHERE o.id = t.id)
    ),
    after_lanes AS (
      SELECT t.id, t.sort_order FROM public.assignment_types AS t
      WHERE t.organization_id = v_organization_id AND t.show_on_calendar AND t.archived_at IS NULL
    ),
    before_kept AS (
      SELECT b.id, pg_catalog.row_number() OVER (ORDER BY b.sort_order, b.id) AS position
      FROM before_lanes AS b WHERE b.id IN (SELECT a.id FROM after_lanes AS a)
    ),
    after_kept AS (
      SELECT a.id, pg_catalog.row_number() OVER (ORDER BY a.sort_order, a.id) AS position
      FROM after_lanes AS a WHERE a.id IN (SELECT b.id FROM before_lanes AS b)
    )
    SELECT pg_catalog.count(*)::integer, coalesce(pg_catalog.bool_or(bk.position <> ak.position), false)
    INTO v_kept, v_moved
    FROM before_kept AS bk JOIN after_kept AS ak USING (id);
    IF v_moved THEN
      PERFORM audit_private.record_entry(
        v_organization_id, 'assignment_type.calendar_lanes_reordered', 'organization', v_organization_id, NULL,
        NULL, NULL, pg_catalog.jsonb_build_object('count', v_kept)
      );
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_calendar_lanes_reordered() FROM PUBLIC, anon, authenticated, service_role;

-- Transition tables cannot be combined with a column list, so the function skips updates that touch no lane column.
CREATE TRIGGER audit_calendar_lanes_reordered
AFTER UPDATE ON public.assignment_types
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION audit_private.audit_calendar_lanes_reordered();

COMMIT;
