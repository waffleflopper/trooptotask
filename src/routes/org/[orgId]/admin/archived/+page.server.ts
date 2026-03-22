import type { PageServerLoad } from './$types';
import { queryPersonnel } from '$lib/server/personnelRepository';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [personnelResult, orgRes] = await Promise.all([
		queryPersonnel({
			supabase: locals.supabase,
			orgId: params.orgId,
			archived: true,
			orderBy: [{ column: 'archived_at', ascending: false }]
		}),
		locals.supabase.from('organizations').select('archive_retention_months').eq('id', params.orgId).single()
	]);

	const archivedPersonnel = personnelResult.data.map((p) => ({
		id: p.id,
		rank: p.rank,
		firstName: p.firstName,
		lastName: p.lastName,
		mos: p.mos,
		groupName: p.groupName,
		archivedAt: p.archivedAt as string,
		groupId: p.groupId
	}));

	return {
		archivedPersonnel,
		retentionMonths: orgRes.data?.archive_retention_months ?? 36
	};
};
