CREATE FUNCTION organization_private.valid_setup_answers(p_answers jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_answers) <> 'object' THEN false ELSE NOT EXISTS (
    SELECT 1 FROM jsonb_each(p_answers) AS entry(key, value)
    WHERE key <> ALL (ARRAY['welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
      OR value NOT IN ('"reviewed"'::jsonb, '"later"'::jsonb)
  ) END;
$$;

CREATE FUNCTION organization_private.valid_setup_prompt(p_state jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE day text;
BEGIN
  IF p_state = '{"never":true}'::jsonb THEN RETURN true; END IF;
  IF jsonb_typeof(p_state) <> 'object' OR NOT (p_state ? 'snoozedUntil')
    OR p_state - 'snoozedUntil' <> '{}'::jsonb
    OR jsonb_typeof(p_state -> 'snoozedUntil') <> 'string' THEN RETURN false; END IF;
  day := p_state ->> 'snoozedUntil';
  IF day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
  PERFORM make_date(substring(day,1,4)::integer, substring(day,6,2)::integer, substring(day,9,2)::integer);
  RETURN true;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END;
$$;

CREATE FUNCTION organization_private.valid_setup_prompts(p_prompts jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_prompts) <> 'object' THEN false ELSE NOT EXISTS (
    SELECT 1 FROM jsonb_each(p_prompts) AS entry(key, value)
    WHERE key <> ALL (ARRAY['setup','welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
      OR NOT organization_private.valid_setup_prompt(value)
  ) END;
$$;

REVOKE ALL ON FUNCTION organization_private.valid_setup_answers(jsonb),
  organization_private.valid_setup_prompt(jsonb), organization_private.valid_setup_prompts(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE public.organization_setup (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch text CHECK (branch IN ('army','navy','air-force','marine-corps','coast-guard','space-force','civilian','custom')),
  answers jsonb NOT NULL DEFAULT '{}' CHECK (organization_private.valid_setup_answers(answers)),
  prompts jsonb NOT NULL DEFAULT '{}' CHECK (organization_private.valid_setup_prompts(prompts)),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_setup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_setup FROM PUBLIC, anon, authenticated;

INSERT INTO public.organization_setup(organization_id, answers)
SELECT o.id, '{"groups":"reviewed","ranks":"reviewed","calendar":"reviewed"}'::jsonb
FROM public.organizations AS o
WHERE EXISTS (SELECT 1 FROM public.personnel AS p WHERE p.organization_id = o.id AND p.archived_at IS NULL);

CREATE FUNCTION public.read_organization_setup(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN RAISE insufficient_privilege; END IF;
  RETURN COALESCE((
    SELECT jsonb_build_object('branch', s.branch, 'answers', s.answers,
      'prompts', s.prompts, 'finishedAt', s.finished_at)
    FROM public.organization_setup AS s WHERE s.organization_id = p_organization_id
  ), '{"branch":null,"answers":{},"prompts":{},"finishedAt":null}'::jsonb);
END;
$$;

CREATE FUNCTION public.export_organization_setup(p_organization_id uuid)
RETURNS SETOF public.organization_setup LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_org_owner(p_organization_id) THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY SELECT * FROM public.organization_setup WHERE organization_id = p_organization_id;
END;
$$;

CREATE FUNCTION public.save_organization_setup_answer(p_organization_id uuid, p_step text, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The capability helper accepts feature lanes. Governance still needs its fixed-role gate.
  IF NOT public.is_org_privileged(p_organization_id)
    OR NOT public.member_access_has_capability(p_organization_id, 'organization', 'configure')
    THEN RAISE insufficient_privilege; END IF;
  IF p_step IS NULL OR p_step <> ALL (ARRAY['welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
    OR (p_answer IS NOT NULL AND p_answer NOT IN ('reviewed','later'))
    THEN RAISE invalid_parameter_value USING MESSAGE = 'Invalid setup answer'; END IF;
  INSERT INTO public.organization_setup(organization_id, answers)
  VALUES (p_organization_id, CASE WHEN p_answer IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_step,p_answer) END)
  ON CONFLICT (organization_id) DO UPDATE SET
    answers = CASE WHEN p_answer IS NULL THEN organization_setup.answers - p_step
      ELSE jsonb_set(organization_setup.answers, ARRAY[p_step], to_jsonb(p_answer)) END,
    updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;

CREATE FUNCTION public.save_organization_setup_branch(p_organization_id uuid, p_branch text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The capability helper accepts feature lanes. Governance still needs its fixed-role gate.
  IF NOT public.is_org_privileged(p_organization_id)
    OR NOT public.member_access_has_capability(p_organization_id, 'organization', 'configure')
    THEN RAISE insufficient_privilege; END IF;
  IF p_branch IS NOT NULL AND p_branch NOT IN ('army','navy','air-force','marine-corps','coast-guard','space-force','civilian','custom')
    THEN RAISE invalid_parameter_value USING MESSAGE = 'Invalid setup branch'; END IF;
  INSERT INTO public.organization_setup(organization_id, branch) VALUES (p_organization_id,p_branch)
  ON CONFLICT (organization_id) DO UPDATE SET branch = EXCLUDED.branch, updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;

CREATE FUNCTION public.finish_organization_setup(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The capability helper accepts feature lanes. Governance still needs its fixed-role gate.
  IF NOT public.is_org_privileged(p_organization_id)
    OR NOT public.member_access_has_capability(p_organization_id, 'organization', 'configure')
    THEN RAISE insufficient_privilege; END IF;
  INSERT INTO public.organization_setup(organization_id, finished_at) VALUES (p_organization_id,now())
  ON CONFLICT (organization_id) DO UPDATE SET finished_at = now(), updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;

CREATE FUNCTION public.save_organization_setup_prompt(p_organization_id uuid, p_key text, p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_org_owner(p_organization_id) THEN RAISE insufficient_privilege; END IF;
  IF p_key IS NULL OR p_key <> ALL (ARRAY['setup','welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
    OR (p_state IS NOT NULL AND NOT organization_private.valid_setup_prompt(p_state))
    THEN RAISE invalid_parameter_value USING MESSAGE = 'Invalid setup prompt'; END IF;
  INSERT INTO public.organization_setup(organization_id, prompts)
  VALUES (p_organization_id, CASE WHEN p_state IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_key,p_state) END)
  ON CONFLICT (organization_id) DO UPDATE SET
    prompts = CASE WHEN p_state IS NULL THEN organization_setup.prompts - p_key
      ELSE jsonb_set(organization_setup.prompts, ARRAY[p_key], p_state) END,
    updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;

ALTER FUNCTION public.read_organization_setup(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_organization_setup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_organization_setup(uuid) TO authenticated;

ALTER FUNCTION public.export_organization_setup(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.export_organization_setup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_organization_setup(uuid) TO authenticated;

ALTER FUNCTION public.save_organization_setup_answer(uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_organization_setup_answer(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_organization_setup_answer(uuid,text,text) TO authenticated;

ALTER FUNCTION public.save_organization_setup_branch(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_organization_setup_branch(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_organization_setup_branch(uuid,text) TO authenticated;

ALTER FUNCTION public.finish_organization_setup(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finish_organization_setup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_organization_setup(uuid) TO authenticated;

ALTER FUNCTION public.save_organization_setup_prompt(uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_organization_setup_prompt(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_organization_setup_prompt(uuid,text,jsonb) TO authenticated;

DROP TABLE public.getting_started_progress;
