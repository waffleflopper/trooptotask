import type { LayoutServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { personnelTrainingRepo } from '$lib/server/repositories';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends, parent }) => {
	depends('app:training-data');
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();
	const allTrainings = await personnelTrainingRepo.list(supabase, orgId);

	let personnelTrainings = allTrainings;
	if (parentData.scopedGroupId) {
		const scopedIds = new Set((parentData.personnel ?? []).map((p) => p.id));
		personnelTrainings = allTrainings.filter((t) => scopedIds.has(t.personnelId));
	}

	return { personnelTrainings, orgId };
};
