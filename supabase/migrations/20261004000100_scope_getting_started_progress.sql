-- Getting Started dismissal is a self action within current Organization membership.
-- Keep historical rows intact; membership removal hides them rather than deleting them.
ALTER POLICY "Users can manage their own getting started progress"
ON public.getting_started_progress
USING ((SELECT auth.uid()) = user_id AND public.is_org_member(organization_id))
WITH CHECK ((SELECT auth.uid()) = user_id AND public.is_org_member(organization_id));
