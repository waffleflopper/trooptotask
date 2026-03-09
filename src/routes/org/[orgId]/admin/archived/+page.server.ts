import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [personnelRes, orgRes] = await Promise.all([
		locals.supabase
			.from('personnel')
			.select('id, rank, first_name, last_name, mos, group_id, archived_at, groups(name)')
			.eq('organization_id', params.orgId)
			.not('archived_at', 'is', null)
			.order('archived_at', { ascending: false }),
		locals.supabase
			.from('organizations')
			.select('archive_retention_months')
			.eq('id', params.orgId)
			.single()
	]);

	const archivedPersonnel = (personnelRes.data ?? []).map((p: any) => ({
		id: p.id,
		rank: p.rank,
		firstName: p.first_name,
		lastName: p.last_name,
		mos: p.mos,
		groupName: p.groups?.name ?? '',
		archivedAt: p.archived_at,
		groupId: p.group_id
	}));

	return {
		archivedPersonnel,
		retentionMonths: orgRes.data?.archive_retention_months ?? 36
	};
};
