-- Coordinated cutover: deploy the ID-valued Calendar consumers with this migration.
-- Old application versions still submit/display Group names and are incompatible.
-- Resolve exact legacy names only within their Organization, without guessing at
-- deleted/renamed Groups or UUID/name collisions. Preserve every saved slot.
DO $$
DECLARE
 unresolved_count bigint;
BEGIN
 -- Keep the preflight and conversion consistent with concurrent Group/slot edits.
 LOCK TABLE public.groups, public.assignment_types, public.daily_assignments IN SHARE ROW EXCLUSIVE MODE;

 SELECT count(*) INTO unresolved_count
 FROM public.daily_assignments AS assignment
 JOIN public.assignment_types AS assignment_type
  ON assignment_type.id = assignment.assignment_type_id
 WHERE assignment_type.assign_to = 'group'
  AND (assignment_type.organization_id <> assignment.organization_id OR (
   SELECT count(*) FROM public.groups AS candidate
   WHERE candidate.organization_id = assignment.organization_id
    AND (candidate.id::text = assignment.assignee_id OR candidate.name = assignment.assignee_id)
  ) <> 1);

 IF unresolved_count > 0 THEN
  RAISE EXCEPTION 'Calendar Group conversion blocked: % unresolved or ambiguous assignment reference(s)', unresolved_count
   USING HINT = 'Resolve each reference to exactly one same-Organization Group before retrying. No assignment rows were changed; do not delete historical slots to bypass this preflight.';
 END IF;

 UPDATE public.daily_assignments AS assignment
 SET assignee_id = assigned_group.id::text
 FROM public.assignment_types AS assignment_type, public.groups AS assigned_group
 WHERE assignment_type.id = assignment.assignment_type_id
  AND assignment_type.organization_id = assignment.organization_id
  AND assignment_type.assign_to = 'group'
  AND assigned_group.organization_id = assignment.organization_id
  AND assigned_group.name = assignment.assignee_id
  AND assignment.assignee_id <> assigned_group.id::text;
END;
$$;
