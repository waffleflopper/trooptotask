-- #2033 An Organization can name one default onboarding template, which the Start Onboarding dialog preselects.
-- Only an Organization owner or admin sets it, and only through set_default_onboarding_template. A member who may
-- configure templates can still rename them, but cannot write is_default directly: the column has no UPDATE grant
-- (updates are already granted per column) and is left out of the INSERT grant below.
BEGIN;

ALTER TABLE public.onboarding_templates ADD COLUMN is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX onboarding_templates_one_default_idx
  ON public.onboarding_templates (organization_id) WHERE is_default;

REVOKE INSERT ON TABLE public.onboarding_templates FROM authenticated;
GRANT INSERT (id, organization_id, name, description, created_at) ON TABLE public.onboarding_templates TO authenticated;

-- Leaving the template out (null) clears the default. Setting a template clears the previous default in the same transaction.
CREATE FUNCTION public.set_default_onboarding_template(p_organization_id uuid, p_template_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Default onboarding template changes require READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF auth.uid() IS NULL OR p_organization_id IS NULL OR public.is_org_privileged(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an Organization admin can set the default onboarding template' USING ERRCODE = '42501';
  END IF;

  -- Two admins choosing at once queue here instead of failing on the one-default index.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('onboarding-default-template:' || p_organization_id::text, 0));

  IF p_template_id IS NOT NULL THEN
    PERFORM 1 FROM public.onboarding_templates AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_template_id
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.onboarding_templates AS t SET is_default = false
  WHERE t.organization_id = p_organization_id AND t.is_default AND t.id IS DISTINCT FROM p_template_id;
  IF p_template_id IS NOT NULL THEN
    UPDATE public.onboarding_templates AS t SET is_default = true
    WHERE t.organization_id = p_organization_id AND t.id = p_template_id AND NOT t.is_default;
  END IF;

  -- Fresh statement after the lock wait: the caller must still be an admin.
  IF public.is_org_privileged(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an Organization admin can set the default onboarding template' USING ERRCODE = '42501';
  END IF;
  RETURN p_template_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_onboarding_template(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_default_onboarding_template(uuid, uuid) TO authenticated;

-- A default change is audited like a rename: the entry names the template and shows it going from no to yes.
CREATE OR REPLACE FUNCTION audit_private.audit_onboarding_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.onboarding_templates;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_source text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'onboarding_template.created' WHEN 'UPDATE' THEN 'onboarding_template.updated' WHEN 'DELETE' THEN 'onboarding_template.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(
      pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "isDefault": "is_default"}');
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_change := v_change || pg_catalog.jsonb_build_object('description', true);
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := '{}'::jsonb;
  -- duplicate_onboarding_template files its receipt before it inserts the copy, so the receipt names the source.
  IF TG_OP = 'INSERT' THEN
    SELECT item.name INTO v_source
    FROM onboarding_private.template_duplicate_receipts receipt
    JOIN public.onboarding_templates item
      ON item.id = receipt.source_template_id AND item.organization_id = receipt.organization_id
    WHERE receipt.organization_id = NEW.organization_id AND receipt.result_template_id = NEW.id;
    IF v_source IS NOT NULL THEN
      v_kind := 'onboarding_template.duplicated';
      v_details := pg_catalog.jsonb_build_object('source', v_source);
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'onboarding_template', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;

COMMIT;
