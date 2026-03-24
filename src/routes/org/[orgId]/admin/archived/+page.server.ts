import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { PersonnelEntity } from '$lib/server/entities/personnel';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;

	// Query org retention setting directly — organizations table doesn't have
	// organization_id so it can't go through DataStore's auto org_id filter
	const { data: orgRow } = await locals.supabase
		.from('organizations')
		.select('archive_retention_months')
		.eq('id', orgId)
		.single();

	const retentionMonths = (orgRow?.archive_retention_months ?? 36) as number;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			const personnelRows = await ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
				select: PersonnelEntity.select,
				isNull: { archived_at: false },
				orderBy: [{ column: 'archived_at', ascending: false }]
			});

			const archivedPersonnel = PersonnelEntity.fromDbArray(personnelRows).map((p) => ({
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
				retentionMonths
			};
		}
	});
};
