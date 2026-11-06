-- #1999 A duplicated onboarding template is audited as duplicated, naming the template it was copied from as it was
-- named then, instead of as a new template.
BEGIN;

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
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name"}');
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
