-- Columns that name who wrote, reviewed or reported a record are set by the database for a
-- signed-in caller. A member calling the Data API directly cannot name another member,
-- rewrite an existing author, reopen a reviewed deletion request or skip storage limits.
-- Server code runs with the service role, where auth.uid() is null, and keeps supplying
-- its own values.
BEGIN;

-- One trigger function serves every author column; TG_ARGV[0] names the column.
-- A new row records the caller; an update keeps the saved author.
CREATE FUNCTION organization_private.stamp_record_author() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  RETURN pg_catalog.jsonb_populate_record(NEW, pg_catalog.jsonb_build_object(TG_ARGV[0],
    CASE TG_OP WHEN 'INSERT' THEN pg_catalog.to_jsonb(v_actor) ELSE pg_catalog.to_jsonb(OLD) -> TG_ARGV[0] END));
END;
$$;
REVOKE ALL ON FUNCTION organization_private.stamp_record_author() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_author BEFORE INSERT OR UPDATE OF author ON public.leader_notes
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('author');
CREATE TRIGGER stamp_author BEFORE INSERT OR UPDATE OF created_by ON public.personnel_follow_ups
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('created_by');
CREATE TRIGGER stamp_author BEFORE INSERT OR UPDATE OF uploaded_by ON public.personnel_documents
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('uploaded_by');
CREATE TRIGGER stamp_author BEFORE INSERT OR UPDATE OF uploaded_by ON public.counseling_records
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('uploaded_by');
CREATE TRIGGER stamp_author BEFORE INSERT OR UPDATE OF created_by ON public.sign_in_rosters
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('created_by');
CREATE TRIGGER stamp_author BEFORE INSERT OR UPDATE OF logged_by ON public.personnel_ict_completions
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('logged_by');
CREATE TRIGGER stamp_author BEFORE INSERT OR UPDATE OF created_by ON public.training_views
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('created_by');
-- The export insert policy already requires requested_by = auth.uid(); only updates need the stamp.
CREATE TRIGGER stamp_author BEFORE UPDATE OF requested_by ON public.data_exports
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_record_author('requested_by');

-- Operators see the reporter's account email and the Organization name. A signed-in reporter
-- gets both from their account and membership, not from the request body.
CREATE FUNCTION organization_private.stamp_feedback_reporter() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.user_email := (SELECT account.email FROM auth.users AS account WHERE account.id = v_actor);
  NEW.organization_name := (
    SELECT organization.name FROM public.organizations AS organization
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = organization.id AND membership.user_id = v_actor
    WHERE organization.id = NEW.organization_id
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.stamp_feedback_reporter() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_reporter BEFORE INSERT ON public.beta_feedback
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_feedback_reporter();

-- Denial is the only review a member manager performs directly; approvals already run in
-- database functions that also apply the deletion. The table is no longer directly updatable.
CREATE FUNCTION public.deny_deletion_request(
  p_organization_id uuid, p_request_id uuid, p_resource_type text, p_resource_id uuid, p_denial_reason text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_reviewer uuid := auth.uid();
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Deletion request review requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF v_reviewer IS NULL OR NOT public.can_manage_org_members(p_organization_id) THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.deletion_requests AS request
  SET status = 'denied', reviewed_by = v_reviewer, reviewed_at = now(), denial_reason = p_denial_reason
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.resource_type = p_resource_type AND request.resource_id = p_resource_id
    AND request.status = 'pending';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Fresh statement after a possible wait on a concurrent review of the same row.
  IF NOT public.can_manage_org_members(p_organization_id) THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.deny_deletion_request(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.deny_deletion_request(uuid, uuid, text, uuid, text) TO authenticated;

DROP POLICY deletion_requests_update_admin ON public.deletion_requests;
REVOKE UPDATE ON public.deletion_requests FROM anon, authenticated;

-- Storage usage sums file_size_bytes, which only the server's upload path sets.
REVOKE UPDATE ON public.personnel_documents FROM anon, authenticated;
GRANT UPDATE (id, organization_id, personnel_id, title, file_path, content_type, uploaded_by,
  created_at, updated_at, archived_at, archived_by) ON public.personnel_documents TO authenticated;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_personnel_document_storage_cap_bytes_check
  CHECK (personnel_document_storage_cap_bytes BETWEEN 10485760 AND 1073741824);

-- Member names and emails follow the same admission as every other membership helper.
CREATE OR REPLACE FUNCTION public.organization_member_labels(p_organization_id uuid)
RETURNS TABLE(user_id uuid, rank text, first_name text, last_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.user_id, p.rank, p.first_name, p.last_name, m.email
  FROM public.organization_memberships m
  LEFT JOIN public.user_profiles p ON p.user_id = m.user_id
  WHERE m.organization_id = p_organization_id
    AND EXISTS (SELECT 1 FROM public.organization_memberships caller
      WHERE caller.organization_id = p_organization_id AND caller.user_id = auth.uid())
    AND public.organization_access_admitted(p_organization_id)
  ORDER BY m.user_id;
$$;

-- Later functions no longer get an explicit anonymous grant, and later tables give client roles
-- neither TRUNCATE nor TRIGGER, which the Data API never issues.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, TRIGGER ON TABLES FROM anon, authenticated;

COMMIT;
