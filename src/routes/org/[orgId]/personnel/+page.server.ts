import type { PageServerLoad } from './$types';
import type { RatingSchemeEntry } from '$lib/types';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);
	const userId = locals.user?.id;

	const parentData = await parent();

	const [pinnedGroupsRes, ratingSchemeRes] = await Promise.all([
		userId ? supabase
			.from('user_pinned_groups')
			.select('*')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.order('sort_order') : Promise.resolve({ data: [] }),
		supabase
			.from('rating_scheme_entries')
			.select('*')
			.eq('organization_id', orgId)
			.order('rating_period_end')
	]);

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map((p: any) => p.group_name);

	const ratingSchemeEntries: RatingSchemeEntry[] = (ratingSchemeRes.data ?? []).map((r: any) => ({
		id: r.id,
		ratedPersonId: r.rated_person_id,
		evalType: r.eval_type,
		raterPersonId: r.rater_person_id,
		raterName: r.rater_name,
		seniorRaterPersonId: r.senior_rater_person_id,
		seniorRaterName: r.senior_rater_name,
		intermediateRaterPersonId: r.intermediate_rater_person_id,
		intermediateRaterName: r.intermediate_rater_name,
		reviewerPersonId: r.reviewer_person_id,
		reviewerName: r.reviewer_name,
		ratingPeriodStart: r.rating_period_start,
		ratingPeriodEnd: r.rating_period_end,
		status: r.status,
		notes: r.notes,
		reportType: r.report_type,
		workflowStatus: r.workflow_status
	}));

	return {
		orgId,
		pinnedGroups,
		ratingSchemeEntries
	};
};
