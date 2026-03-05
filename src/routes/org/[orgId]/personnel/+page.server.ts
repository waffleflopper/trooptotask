import type { PageServerLoad } from './$types';
import type { Personnel, RatingSchemeEntry } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);
	const userId = locals.user?.id;

	const [personnelRes, groupsRes, pinnedGroupsRes, ratingSchemeRes] = await Promise.all([
		supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('organization_id', orgId)
			.order('last_name'),
		supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
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

	const personnel: Personnel[] = (personnelRes.data ?? []).map((p: any) => ({
		id: p.id,
		rank: p.rank,
		lastName: p.last_name,
		firstName: p.first_name,
		mos: p.mos ?? '',
		clinicRole: p.clinic_role,
		groupId: p.group_id,
		groupName: p.groups?.name ?? ''
	}));

	const groups: Group[] = (groupsRes.data ?? []).map((g: any) => ({
		id: g.id,
		name: g.name,
		sortOrder: g.sort_order
	}));

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
		notes: r.notes
	}));

	return {
		orgId,
		personnel,
		groups,
		pinnedGroups,
		ratingSchemeEntries
	};
};
