BEGIN;

CREATE TABLE public.feedback_staff_notes (
 feedback_id uuid PRIMARY KEY REFERENCES public.beta_feedback(id) ON DELETE CASCADE,
 body text NOT NULL,
 updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_staff_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_staff_notes_operator_read ON public.feedback_staff_notes
 FOR SELECT TO authenticated USING (public.is_platform_operator());
REVOKE ALL ON public.feedback_staff_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.feedback_staff_notes TO authenticated;
GRANT ALL ON public.feedback_staff_notes TO service_role;

INSERT INTO public.feedback_staff_notes(feedback_id, body, updated_at)
 SELECT id, admin_notes, updated_at FROM public.beta_feedback WHERE admin_notes IS NOT NULL;
ALTER TABLE public.beta_feedback DROP COLUMN admin_notes;
ALTER TABLE public.beta_feedback ADD COLUMN updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE public.feedback_replies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 feedback_id uuid NOT NULL REFERENCES public.beta_feedback(id) ON DELETE CASCADE,
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
 sent_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_replies_thread ON public.feedback_replies(feedback_id, sent_at, id);
ALTER TABLE public.feedback_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_replies_read ON public.feedback_replies FOR SELECT TO authenticated
 USING (public.is_platform_operator() OR EXISTS (
  SELECT 1 FROM public.beta_feedback f WHERE f.id = feedback_id AND f.user_id = (SELECT auth.uid())
 ));
REVOKE ALL ON public.feedback_replies FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.feedback_replies TO authenticated;
GRANT SELECT, INSERT ON public.feedback_replies TO service_role;

-- Grant message columns explicitly so an INSERT cannot name even a default-valued staff field.
DROP POLICY "Users can insert own feedback" ON public.beta_feedback;
DROP POLICY "Admins full access" ON public.beta_feedback;
CREATE POLICY feedback_operator_read ON public.beta_feedback FOR SELECT TO authenticated
 USING (public.is_platform_operator());
CREATE POLICY feedback_submit_own ON public.beta_feedback FOR INSERT TO authenticated
 WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE INSERT ON public.beta_feedback FROM anon, authenticated;
GRANT INSERT(id, user_id, user_email, organization_id, organization_name, category, message, page_url, page_section)
 ON public.beta_feedback TO authenticated;
REVOKE INSERT(updated_by) ON public.beta_feedback FROM authenticated;

-- Account-only feedback has no Organization. Existing Organization-scoped reads remain scoped.
ALTER TABLE public.notifications ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_account_feedback_only
 CHECK (organization_id IS NOT NULL OR type = 'feedback_reply');

CREATE FUNCTION public.reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_reply public.feedback_replies;
BEGIN
 IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'Platform operator access is required' USING ERRCODE = '42501'; END IF;
 IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 5000 OR p_close IS NULL THEN
  RAISE EXCEPTION 'A reply between 1 and 5000 characters is required' USING ERRCODE = '22023';
 END IF;
 PERFORM 1 FROM public.beta_feedback WHERE id = p_feedback_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.feedback_replies(feedback_id, body) VALUES(p_feedback_id, btrim(p_body)) RETURNING * INTO v_reply;
 UPDATE public.beta_feedback SET status = CASE WHEN p_close THEN 'resolved' ELSE 'reviewed' END,
  updated_by = auth.uid() WHERE id = p_feedback_id;
 RETURN to_jsonb(v_reply);
END;
$$;

CREATE FUNCTION public.save_feedback_staff_note(p_feedback_id uuid, p_body text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'Platform operator access is required' USING ERRCODE = '42501'; END IF;
 IF p_body IS NULL OR length(p_body) > 5000 THEN RAISE EXCEPTION 'Invalid staff note' USING ERRCODE = '22023'; END IF;
 PERFORM 1 FROM public.beta_feedback WHERE id = p_feedback_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF btrim(p_body) = '' THEN
  DELETE FROM public.feedback_staff_notes WHERE feedback_id = p_feedback_id;
 ELSE
  INSERT INTO public.feedback_staff_notes(feedback_id, body) VALUES (p_feedback_id, btrim(p_body))
  ON CONFLICT (feedback_id) DO UPDATE SET body = excluded.body, updated_by = auth.uid(), updated_at = now();
 END IF;
 RETURN true;
END;
$$;

CREATE FUNCTION public.save_feedback_github_issue(p_feedback_id uuid, p_issue_number integer, p_issue_url text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'Platform operator access is required' USING ERRCODE = '42501'; END IF;
 IF p_issue_number IS NULL OR p_issue_number <= 0 OR p_issue_url IS DISTINCT FROM
  'https://github.com/waffleflopper/trooptotask/issues/' || p_issue_number::text THEN
  RAISE EXCEPTION 'Invalid GitHub issue' USING ERRCODE = '22023';
 END IF;
 UPDATE public.beta_feedback SET github_issue_number = p_issue_number, github_issue_url = p_issue_url,
  updated_by = auth.uid() WHERE id = p_feedback_id AND github_issue_number IS NULL AND github_issue_url IS NULL;
 RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reply_to_feedback(uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_feedback_staff_note(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_feedback_github_issue(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_feedback(uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_feedback_staff_note(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_feedback_github_issue(uuid,integer,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
