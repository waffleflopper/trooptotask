-- Equipment requirements and a flat checklist on a Tasking. Whoever can manage the
-- Tasking edits both lists while it is active; whoever can see the Tasking reads them.
-- Order, attribution and Activity come from the database. Neither list ever moves
-- the Tasking's status.
BEGIN;

CREATE TABLE public.calendar_tasking_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  tasking_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 200),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  -- Ready is secured_quantity = quantity and partial is in between; there is no separate flag.
  secured_quantity integer NOT NULL DEFAULT 0,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT calendar_tasking_equipment_secured CHECK (secured_quantity BETWEEN 0 AND quantity),
  FOREIGN KEY (organization_id, tasking_id)
    REFERENCES public.calendar_taskings (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX calendar_tasking_equipment_tasking_idx
  ON public.calendar_tasking_equipment (organization_id, tasking_id, position);

CREATE TABLE public.calendar_tasking_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  tasking_id uuid NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> '' AND char_length(label) <= 200),
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by uuid,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT calendar_tasking_checklist_done CHECK (done = (done_at IS NOT NULL) AND (done OR done_by IS NULL)),
  FOREIGN KEY (organization_id, tasking_id)
    REFERENCES public.calendar_taskings (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX calendar_tasking_checklist_items_tasking_idx
  ON public.calendar_tasking_checklist_items (organization_id, tasking_id, position);

DO $$
DECLARE
  v_kinds text[];
BEGIN
  SELECT pg_catalog.array_agg(DISTINCT m[1]) INTO v_kinds
  FROM pg_catalog.pg_constraint AS c,
    LATERAL pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
  WHERE c.conrelid = 'public.calendar_tasking_activity'::regclass
    AND c.conname = 'calendar_tasking_activity_kind_check';
  v_kinds := v_kinds || ARRAY[
    'equipment_added', 'equipment_removed', 'equipment_changed', 'equipment_secured',
    'checklist_added', 'checklist_removed', 'checklist_renamed', 'checklist_completed', 'checklist_reopened'
  ];
  ALTER TABLE public.calendar_tasking_activity DROP CONSTRAINT calendar_tasking_activity_kind_check;
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.calendar_tasking_activity ADD CONSTRAINT calendar_tasking_activity_kind_check CHECK (kind = ANY (%L::text[]))',
    (SELECT pg_catalog.array_agg(DISTINCT k) FROM pg_catalog.unnest(v_kinds) AS k)
  );
END;
$$;

-- Takes the Tasking's row lock before a list write, so completing a Tasking, adding to a
-- list and editing an item queue instead of racing, and refuses the write once the Tasking
-- is closed. A caller who could not manage the Tasking is left to the policy's refusal.
CREATE FUNCTION calendar_private.lock_calendar_tasking_for_list_write(
  p_organization_id uuid,
  p_tasking_id uuid,
  p_adding boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_group uuid;
BEGIN
  IF p_adding THEN
    SELECT t.status, t.responsible_group_id INTO v_status, v_group
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
    FOR NO KEY UPDATE;
  ELSE
    SELECT t.status, t.responsible_group_id INTO v_status, v_group
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
    FOR SHARE;
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open', 'in_progress', 'blocked')
    AND calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) THEN
    RAISE EXCEPTION 'A completed or cancelled tasking cannot change' USING ERRCODE = '55000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.lock_calendar_tasking_for_list_write(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION calendar_private.stamp_calendar_tasking_equipment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_last integer;
BEGIN
  PERFORM calendar_private.lock_calendar_tasking_for_list_write(NEW.organization_id, NEW.tasking_id, TG_OP = 'INSERT');
  IF TG_OP = 'INSERT' THEN
    SELECT pg_catalog.count(*), pg_catalog.max(position) INTO v_count, v_last
    FROM public.calendar_tasking_equipment
    WHERE organization_id = NEW.organization_id AND tasking_id = NEW.tasking_id;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'A tasking holds up to 100 equipment requirements' USING ERRCODE = '54000';
    END IF;
    NEW.position := COALESCE(v_last, 0) + 1;
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
  ELSE
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.tasking_id := OLD.tasking_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_tasking_equipment() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_calendar_tasking_equipment
BEFORE INSERT OR UPDATE ON public.calendar_tasking_equipment
FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_tasking_equipment();

CREATE FUNCTION calendar_private.stamp_calendar_tasking_checklist_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_last integer;
BEGIN
  PERFORM calendar_private.lock_calendar_tasking_for_list_write(NEW.organization_id, NEW.tasking_id, TG_OP = 'INSERT');
  IF TG_OP = 'INSERT' THEN
    SELECT pg_catalog.count(*), pg_catalog.max(position) INTO v_count, v_last
    FROM public.calendar_tasking_checklist_items
    WHERE organization_id = NEW.organization_id AND tasking_id = NEW.tasking_id;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'A tasking holds up to 100 checklist items' USING ERRCODE = '54000';
    END IF;
    NEW.position := COALESCE(v_last, 0) + 1;
    NEW.done := false;
    NEW.done_at := NULL;
    NEW.done_by := NULL;
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
  ELSE
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.tasking_id := OLD.tasking_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    IF NEW.done AND NOT OLD.done THEN
      NEW.done_at := pg_catalog.now();
      NEW.done_by := auth.uid();
    ELSIF NOT NEW.done THEN
      NEW.done_at := NULL;
      NEW.done_by := NULL;
    ELSE
      NEW.done_at := OLD.done_at;
      NEW.done_by := OLD.done_by;
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_tasking_checklist_item() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_calendar_tasking_checklist_item
BEFORE INSERT OR UPDATE ON public.calendar_tasking_checklist_items
FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_tasking_checklist_item();

-- Deleting an item records its removal only while the Tasking still exists, so
-- removing an Organization is not blocked by Activity for Taskings it is deleting.
CREATE FUNCTION calendar_private.record_calendar_tasking_equipment_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.tasking_id, NEW.created_by, NEW.created_at, 'equipment_added',
      pg_catalog.jsonb_build_object('name', NEW.name, 'quantity', NEW.quantity, 'securedQuantity', NEW.secured_quantity));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    SELECT OLD.organization_id, OLD.tasking_id, auth.uid(), pg_catalog.now(), 'equipment_removed',
      pg_catalog.jsonb_build_object('name', OLD.name, 'quantity', OLD.quantity, 'securedQuantity', OLD.secured_quantity)
    WHERE EXISTS (
      SELECT 1 FROM public.calendar_taskings AS t WHERE t.organization_id = OLD.organization_id AND t.id = OLD.tasking_id
    );
  ELSE
    IF (NEW.name, NEW.quantity) IS DISTINCT FROM (OLD.name, OLD.quantity) THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at, 'equipment_changed',
        pg_catalog.jsonb_build_object(
          'from', pg_catalog.jsonb_build_object('name', OLD.name, 'quantity', OLD.quantity),
          'to', pg_catalog.jsonb_build_object('name', NEW.name, 'quantity', NEW.quantity)
        ));
    END IF;
    IF NEW.secured_quantity IS DISTINCT FROM OLD.secured_quantity THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at, 'equipment_secured',
        pg_catalog.jsonb_build_object(
          'name', NEW.name, 'quantity', NEW.quantity, 'from', OLD.secured_quantity, 'to', NEW.secured_quantity
        ));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.record_calendar_tasking_equipment_activity() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER record_calendar_tasking_equipment_activity
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_tasking_equipment
FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_tasking_equipment_activity();

CREATE FUNCTION calendar_private.record_calendar_tasking_checklist_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.tasking_id, NEW.created_by, NEW.created_at, 'checklist_added',
      pg_catalog.jsonb_build_object('label', NEW.label));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    SELECT OLD.organization_id, OLD.tasking_id, auth.uid(), pg_catalog.now(), 'checklist_removed',
      pg_catalog.jsonb_build_object('label', OLD.label)
    WHERE EXISTS (
      SELECT 1 FROM public.calendar_taskings AS t WHERE t.organization_id = OLD.organization_id AND t.id = OLD.tasking_id
    );
  ELSE
    IF NEW.label IS DISTINCT FROM OLD.label THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at, 'checklist_renamed',
        pg_catalog.jsonb_build_object('from', OLD.label, 'to', NEW.label));
    END IF;
    IF NEW.done IS DISTINCT FROM OLD.done THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at,
        CASE WHEN NEW.done THEN 'checklist_completed' ELSE 'checklist_reopened' END,
        pg_catalog.jsonb_build_object('label', NEW.label));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.record_calendar_tasking_checklist_activity() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER record_calendar_tasking_checklist_activity
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_tasking_checklist_items
FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_tasking_checklist_activity();

ALTER TABLE public.calendar_tasking_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_tasking_checklist_items ENABLE ROW LEVEL SECURITY;

-- Both lists follow their Tasking: readers through the Tasking's own policy, writers
-- through Calendar operation over its responsibility while the Tasking is active.
CREATE POLICY "Calendar readers view equipment of taskings they can see" ON public.calendar_tasking_equipment
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_equipment.organization_id AND t.id = calendar_tasking_equipment.tasking_id
  )
);
CREATE POLICY "Calendar operators add equipment to active taskings" ON public.calendar_tasking_equipment
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_equipment.organization_id AND t.id = calendar_tasking_equipment.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
);
CREATE POLICY "Calendar operators edit equipment of active taskings" ON public.calendar_tasking_equipment
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_equipment.organization_id AND t.id = calendar_tasking_equipment.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_equipment.organization_id AND t.id = calendar_tasking_equipment.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
);
CREATE POLICY "Calendar operators remove equipment from active taskings" ON public.calendar_tasking_equipment
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_equipment.organization_id AND t.id = calendar_tasking_equipment.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
);

CREATE POLICY "Calendar readers view checklists of taskings they can see" ON public.calendar_tasking_checklist_items
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_checklist_items.organization_id
      AND t.id = calendar_tasking_checklist_items.tasking_id
  )
);
CREATE POLICY "Calendar operators add checklist items to active taskings" ON public.calendar_tasking_checklist_items
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_checklist_items.organization_id
      AND t.id = calendar_tasking_checklist_items.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
);
CREATE POLICY "Calendar operators edit checklist items of active taskings" ON public.calendar_tasking_checklist_items
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_checklist_items.organization_id
      AND t.id = calendar_tasking_checklist_items.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_checklist_items.organization_id
      AND t.id = calendar_tasking_checklist_items.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
);
CREATE POLICY "Calendar operators remove checklist items from active taskings" ON public.calendar_tasking_checklist_items
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_checklist_items.organization_id
      AND t.id = calendar_tasking_checklist_items.tasking_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
);

REVOKE ALL ON public.calendar_tasking_equipment, public.calendar_tasking_checklist_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.calendar_tasking_equipment, public.calendar_tasking_checklist_items TO authenticated;
GRANT INSERT (id, organization_id, tasking_id, name, quantity, secured_quantity)
  ON public.calendar_tasking_equipment TO authenticated;
GRANT UPDATE (name, quantity, secured_quantity) ON public.calendar_tasking_equipment TO authenticated;
GRANT INSERT (id, organization_id, tasking_id, label) ON public.calendar_tasking_checklist_items TO authenticated;
GRANT UPDATE (label, done) ON public.calendar_tasking_checklist_items TO authenticated;
GRANT ALL ON public.calendar_tasking_equipment, public.calendar_tasking_checklist_items TO service_role;

-- Reorders one list in a single statement. Ids listed come first in that order; items
-- not listed keep their relative order after them; unknown ids are ignored.
CREATE FUNCTION public.reorder_calendar_tasking_list(
  p_organization_id uuid, p_tasking_id uuid, p_list text, p_ids uuid[]
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_group uuid;
BEGIN
  IF p_list NOT IN ('equipment', 'checklist') THEN
    RAISE EXCEPTION 'Unknown tasking list' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, t.responsible_group_id INTO v_status, v_group
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('open', 'in_progress', 'blocked') THEN
    RAISE EXCEPTION 'A % tasking cannot change', v_status USING ERRCODE = '55000';
  END IF;

  IF p_list = 'equipment' THEN
    WITH wanted AS (
      SELECT u.id, pg_catalog.min(u.ord) AS ord FROM pg_catalog.unnest(p_ids) WITH ORDINALITY AS u(id, ord) GROUP BY u.id
    ), ranked AS (
      SELECT i.id, pg_catalog.row_number() OVER (
        ORDER BY COALESCE(w.ord, 9223372036854775807), i.position, i.created_at, i.id
      )::integer AS position
      FROM public.calendar_tasking_equipment AS i LEFT JOIN wanted AS w ON w.id = i.id
      WHERE i.organization_id = p_organization_id AND i.tasking_id = p_tasking_id
    )
    UPDATE public.calendar_tasking_equipment AS i SET position = ranked.position
    FROM ranked WHERE i.id = ranked.id AND i.position IS DISTINCT FROM ranked.position;
  ELSE
    WITH wanted AS (
      SELECT u.id, pg_catalog.min(u.ord) AS ord FROM pg_catalog.unnest(p_ids) WITH ORDINALITY AS u(id, ord) GROUP BY u.id
    ), ranked AS (
      SELECT i.id, pg_catalog.row_number() OVER (
        ORDER BY COALESCE(w.ord, 9223372036854775807), i.position, i.created_at, i.id
      )::integer AS position
      FROM public.calendar_tasking_checklist_items AS i LEFT JOIN wanted AS w ON w.id = i.id
      WHERE i.organization_id = p_organization_id AND i.tasking_id = p_tasking_id
    )
    UPDATE public.calendar_tasking_checklist_items AS i SET position = ranked.position
    FROM ranked WHERE i.id = ranked.id AND i.position IS DISTINCT FROM ranked.position;
  END IF;
END;
$$;
ALTER FUNCTION public.reorder_calendar_tasking_list(uuid, uuid, text, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_calendar_tasking_list(uuid, uuid, text, uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_calendar_tasking_list(uuid, uuid, text, uuid[]) TO authenticated;

COMMIT;
