-- A completion's task must belong to the completion's Organization.
-- Keep the original task-ID FK for its historical cascade and relationship name.
-- Existing rows are not validated here because their live contents are unknown;
-- the new FK still rejects new and changed task references.
BEGIN;

ALTER TABLE public.ict_tasks
  ADD CONSTRAINT ict_tasks_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.personnel_ict_completions
  ADD CONSTRAINT personnel_ict_completions_org_task_fkey
  FOREIGN KEY (organization_id, ict_task_id)
  REFERENCES public.ict_tasks (organization_id, id)
  ON DELETE CASCADE
  NOT VALID;

COMMIT;
