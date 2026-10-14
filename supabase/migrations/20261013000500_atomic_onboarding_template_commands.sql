BEGIN;

CREATE TABLE onboarding_private.template_duplicate_receipts (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  source_template_id uuid NOT NULL,
  result_template_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, request_id)
);
CREATE INDEX template_duplicate_receipts_user_idx
  ON onboarding_private.template_duplicate_receipts (user_id);
ALTER TABLE onboarding_private.template_duplicate_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE onboarding_private.template_duplicate_receipts FROM PUBLIC, anon, authenticated, service_role;

-- Each call is a fresh statement, so access revoked while an earlier statement
-- waited on a row, key or name lock is seen here and rolls the command back.
CREATE FUNCTION onboarding_private.require_template_configuration(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  IF public.can_manage_onboarding_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION onboarding_private.admit_template_command(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Onboarding template changes require READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM onboarding_private.require_template_configuration(p_organization_id);
END;
$$;

CREATE FUNCTION public.duplicate_onboarding_template(
  p_organization_id uuid, p_source_template_id uuid, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_copy_id uuid := gen_random_uuid();
  v_inserted uuid;
  v_receipt onboarding_private.template_duplicate_receipts%ROWTYPE;
  v_source public.onboarding_templates%ROWTYPE;
  v_attempt integer := 1;
  v_name text;
  v_result jsonb;
BEGIN
  PERFORM onboarding_private.admit_template_command(p_organization_id);
  IF p_source_template_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Duplicating a template needs the template and a request id' USING ERRCODE = '22023';
  END IF;

  -- A concurrent attempt with the same key waits here until it commits or rolls back.
  INSERT INTO onboarding_private.template_duplicate_receipts (
    organization_id, user_id, request_id, source_template_id, result_template_id
  ) VALUES (p_organization_id, auth.uid(), p_request_id, p_source_template_id, v_copy_id)
  ON CONFLICT (organization_id, user_id, request_id) DO NOTHING
  RETURNING result_template_id INTO v_inserted;
  PERFORM onboarding_private.require_template_configuration(p_organization_id);

  IF v_inserted IS NULL THEN
    SELECT receipt.* INTO v_receipt FROM onboarding_private.template_duplicate_receipts AS receipt
    WHERE receipt.organization_id = p_organization_id AND receipt.user_id = auth.uid()
      AND receipt.request_id = p_request_id;
    IF v_receipt.source_template_id <> p_source_template_id THEN
      RAISE EXCEPTION 'This duplicate request was made for another template' USING ERRCODE = 'OTD01';
    END IF;
    v_copy_id := v_receipt.result_template_id;
  ELSE
    SELECT t.* INTO v_source FROM public.onboarding_templates AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_source_template_id
    FOR SHARE;
    PERFORM onboarding_private.require_template_configuration(p_organization_id);
    IF v_source.id IS NULL THEN
      RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
    END IF;

    LOOP
      v_name := v_source.name || ' Copy' || CASE
        WHEN v_attempt = 1 THEN ''
        WHEN v_attempt < 1000 THEN ' ' || v_attempt
        ELSE ' ' || pg_catalog.left(gen_random_uuid()::text, 8) END;
      -- An uncommitted insert of the same name makes this wait for its outcome.
      INSERT INTO public.onboarding_templates (id, organization_id, name, description)
      VALUES (v_copy_id, p_organization_id, v_name, v_source.description)
      ON CONFLICT ON CONSTRAINT onboarding_templates_org_name_unique DO NOTHING;
      EXIT WHEN FOUND;
      v_attempt := v_attempt + 1;
    END LOOP;

    INSERT INTO public.onboarding_template_steps (
      organization_id, template_id, name, description, step_type, training_type_id, stages, sort_order
    ) SELECT p_organization_id, v_copy_id, s.name, s.description, s.step_type, s.training_type_id, s.stages,
      (pg_catalog.row_number() OVER (ORDER BY s.sort_order, s.id) - 1)::integer
    FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = p_source_template_id;
  END IF;

  PERFORM onboarding_private.require_template_configuration(p_organization_id);
  -- One statement, so a concurrent delete yields OTD02 rather than the copy without its steps.
  SELECT jsonb_build_object(
    'template', to_jsonb(t),
    'steps', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order, s.id), '[]'::jsonb)
      FROM public.onboarding_template_steps AS s
      WHERE s.organization_id = p_organization_id AND s.template_id = t.id),
    'created', v_inserted IS NOT NULL
  ) INTO v_result
  FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = v_copy_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'The copy from this request was deleted' USING ERRCODE = 'OTD02';
  END IF;
  RETURN v_result;
END;
$$;

-- FOR UPDATE on the template blocks step inserts and moves in (their
-- foreign-key check needs KEY SHARE on it); the step locks wait for edits,
-- deletes and moves out, so the membership check is exact.
CREATE FUNCTION public.reorder_onboarding_template_steps(
  p_organization_id uuid, p_template_id uuid, p_step_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_template_id uuid;
BEGIN
  PERFORM onboarding_private.admit_template_command(p_organization_id);
  IF p_template_id IS NULL OR p_step_ids IS NULL OR pg_catalog.array_ndims(p_step_ids) > 1
    OR pg_catalog.array_position(p_step_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Reordering steps needs the template and its step ids' USING ERRCODE = '22023';
  END IF;

  SELECT t.id INTO v_template_id FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_template_id
  FOR UPDATE;
  PERFORM 1 FROM public.onboarding_template_steps AS s
  WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id
  ORDER BY s.id
  FOR UPDATE;
  PERFORM onboarding_private.require_template_configuration(p_organization_id);
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
  END IF;

  IF pg_catalog.cardinality(p_step_ids) <> (
      SELECT pg_catalog.count(*) FROM public.onboarding_template_steps AS s
      WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id)
    OR (SELECT pg_catalog.array_agg(s.id ORDER BY s.id) FROM public.onboarding_template_steps AS s
      WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id)
      IS DISTINCT FROM (SELECT pg_catalog.array_agg(DISTINCT ids.id ORDER BY ids.id)
      FROM pg_catalog.unnest(p_step_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Step order does not match the selected onboarding template' USING ERRCODE = 'OTR01';
  END IF;

  UPDATE public.onboarding_template_steps AS s SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_step_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id AND s.id = o.id;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order, s.id), '[]'::jsonb)
    FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id);
END;
$$;

CREATE FUNCTION public.delete_onboarding_template(p_organization_id uuid, p_template_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_deleted boolean;
BEGIN
  PERFORM onboarding_private.admit_template_command(p_organization_id);
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'Deleting a template needs its id' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_template_id;
  v_deleted := FOUND;

  PERFORM onboarding_private.require_template_configuration(p_organization_id);
  RETURN v_deleted;
END;
$$;

ALTER TABLE onboarding_private.template_duplicate_receipts OWNER TO postgres;
ALTER FUNCTION onboarding_private.require_template_configuration(uuid) OWNER TO postgres;
ALTER FUNCTION onboarding_private.admit_template_command(uuid) OWNER TO postgres;
ALTER FUNCTION public.duplicate_onboarding_template(uuid, uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.reorder_onboarding_template_steps(uuid, uuid, uuid[]) OWNER TO postgres;
ALTER FUNCTION public.delete_onboarding_template(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION onboarding_private.require_template_configuration(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION onboarding_private.admit_template_command(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.duplicate_onboarding_template(uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reorder_onboarding_template_steps(uuid, uuid, uuid[]) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.delete_onboarding_template(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.duplicate_onboarding_template(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_onboarding_template_steps(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_onboarding_template(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
