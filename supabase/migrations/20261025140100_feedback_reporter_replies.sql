BEGIN;

ALTER TABLE public.feedback_replies ADD COLUMN author text;
UPDATE public.feedback_replies SET author = 'operator';
ALTER TABLE public.feedback_replies ALTER COLUMN author SET NOT NULL;
ALTER TABLE public.feedback_replies ADD CONSTRAINT feedback_replies_author_check
 CHECK (author IN ('operator', 'reporter'));

CREATE FUNCTION public.reply_to_own_feedback(p_feedback_id uuid, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_reply public.feedback_replies;
 v_feedback public.beta_feedback;
BEGIN
 IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 5000 THEN
  RAISE EXCEPTION 'A reply between 1 and 5000 characters is required' USING ERRCODE = '22023';
 END IF;
 SELECT * INTO v_feedback FROM public.beta_feedback
  WHERE id = p_feedback_id AND user_id = (SELECT auth.uid()) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_feedback.status = 'resolved' THEN RETURN jsonb_build_object('status', 'closed'); END IF;
 INSERT INTO public.feedback_replies(feedback_id, body, author)
  VALUES(p_feedback_id, btrim(p_body), 'reporter') RETURNING * INTO v_reply;
 UPDATE public.beta_feedback SET status = 'new', updated_by = auth.uid() WHERE id = p_feedback_id;
 RETURN to_jsonb(v_reply);
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_reply public.feedback_replies;
 v_feedback public.beta_feedback;
BEGIN
 IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'Platform operator access is required' USING ERRCODE = '42501'; END IF;
 IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 5000 OR p_close IS NULL THEN
  RAISE EXCEPTION 'A reply between 1 and 5000 characters is required' USING ERRCODE = '22023';
 END IF;
 SELECT * INTO v_feedback FROM public.beta_feedback WHERE id = p_feedback_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_feedback.status = 'resolved' THEN RETURN jsonb_build_object('status', 'closed'); END IF;
 INSERT INTO public.feedback_replies(feedback_id, body, author) VALUES(p_feedback_id, btrim(p_body), 'operator') RETURNING * INTO v_reply;
 UPDATE public.beta_feedback SET status = CASE WHEN p_close THEN 'resolved' ELSE 'reviewed' END,
  updated_by = auth.uid() WHERE id = p_feedback_id;
 INSERT INTO public.notifications(user_id, organization_id, type, title, message, link)
 VALUES(v_feedback.user_id, NULL, 'feedback_reply', 'A reply to your feedback',
  'The TroopToTask operator replied to your feedback.', '/account/feedback/' || p_feedback_id::text);
 RETURN to_jsonb(v_reply);
END;
$$;

UPDATE public.notifications SET link = '/account' || link
 WHERE type = 'feedback_reply' AND link LIKE '/feedback/%';

REVOKE ALL ON FUNCTION public.reply_to_own_feedback(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_own_feedback(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.reply_to_feedback(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_feedback(uuid,text,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
