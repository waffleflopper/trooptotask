import type { PageServerLoad } from './$types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies, parent, depends }) => {
	depends('app:shared-data');
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);
	const userId = locals.user?.id;

	const parentData = await parent();

	const [pinnedGroupsRes, ratingSchemeRes] = await Promise.all([
		userId
			? supabase
					.from('user_pinned_groups')
					.select('*')
					.eq('organization_id', orgId)
					.eq('user_id', userId)
					.order('sort_order')
			: Promise.resolve({ data: [] }),
		supabase.from('rating_scheme_entries').select('*').eq('organization_id', orgId).order('rating_period_end')
	]);

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map(
		(p: Record<string, unknown>) => p.group_name as string
	);

	const ratingSchemeEntries = (ratingSchemeRes.data ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		ratedPersonId: r.rated_person_id as string,
		evalType: r.eval_type as string,
		raterPersonId: r.rater_person_id as string | null,
		raterName: r.rater_name as string | null,
		seniorRaterPersonId: r.senior_rater_person_id as string | null,
		seniorRaterName: r.senior_rater_name as string | null,
		intermediateRaterPersonId: r.intermediate_rater_person_id as string | null,
		intermediateRaterName: r.intermediate_rater_name as string | null,
		reviewerPersonId: r.reviewer_person_id as string | null,
		reviewerName: r.reviewer_name as string | null,
		ratingPeriodStart: r.rating_period_start as string,
		ratingPeriodEnd: r.rating_period_end as string,
		status: r.status as string,
		notes: r.notes as string | null,
		reportType: r.report_type as string | null,
		workflowStatus: r.workflow_status as string | null
	})) as RatingSchemeEntry[];

	return {
		orgId,
		pinnedGroups,
		ratingSchemeEntries
	};
};
