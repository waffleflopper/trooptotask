import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [personnelRes, orgRes] = await Promise.all([
		locals.supabase
			.from('personnel')
			.select('id, rank, first_name, last_name, mos, group_id, archived_at, groups(name)')
			.eq('organization_id', params.orgId)
			.not('archived_at', 'is', null)
			.order('archived_at', { ascending: false }),
		locals.supabase.from('organizations').select('archive_retention_months').eq('id', params.orgId).single()
	]);

	const archivedPersonnel = (personnelRes.data ?? []).map((p: Record<string, unknown>) => ({
		id: p.id as string,
		rank: p.rank as string,
		firstName: p.first_name as string,
		lastName: p.last_name as string,
		mos: p.mos as string,
		groupName: ((p.groups as Record<string, unknown> | null)?.name as string) ?? '',
		archivedAt: p.archived_at as string,
		groupId: p.group_id as string
	}));

	return {
		archivedPersonnel,
		retentionMonths: orgRes.data?.archive_retention_months ?? 36
	};
};
