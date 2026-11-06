-- #1999 Activity filters the unit log by person, member, kind and day and pages it on (timestamp, id), so each filter
-- reads newest first from an index with no sort. The two indexes that lead the same columns are replaced, not kept.
BEGIN;

CREATE INDEX idx_audit_logs_org_timestamp_id
  ON public.audit_logs USING btree (org_id, "timestamp" DESC, id DESC);
DROP INDEX public.idx_audit_logs_org_id_timestamp;

-- list_audit_log_actions reads the leading (org_id, action).
CREATE INDEX idx_audit_logs_org_action_timestamp
  ON public.audit_logs USING btree (org_id, action, "timestamp" DESC, id DESC);
DROP INDEX public.idx_audit_logs_org_id_action;

-- Entries written before saved labels have no person, so they stay out of this index.
CREATE INDEX idx_audit_logs_org_subject_timestamp
  ON public.audit_logs USING btree (org_id, subject_personnel_id, "timestamp" DESC, id DESC)
  WHERE subject_personnel_id IS NOT NULL;

CREATE INDEX idx_audit_logs_org_user_timestamp
  ON public.audit_logs USING btree (org_id, user_id, "timestamp" DESC, id DESC)
  WHERE user_id IS NOT NULL;

COMMIT;
