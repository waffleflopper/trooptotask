import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { PersonnelEntity } from '$lib/server/entities/personnel';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			const [personnelRows, orgRow] = await Promise.all([
				ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
					select: PersonnelEntity.select,
					isNull: { archived_at: false },
					orderBy: [{ column: 'archived_at', ascending: false }]
				}),
				ctx.store.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
					id: ctx.auth.orgId
				})
			]);

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

			const retentionMonths = ((orgRow?.archive_retention_months as number | null) ?? 36) as number;

			return {
				archivedPersonnel,
				retentionMonths
			};
		}
	});
};
