import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { PersonnelEntity } from '$lib/server/entities/personnel';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			const orgRow = await ctx.rawStore.findOne<{ archive_retention_months?: number | null }>(
				'organizations',
				ctx.auth.orgId,
				{},
				'archive_retention_months'
			);
			const retentionMonths = orgRow?.archive_retention_months ?? 36;
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
