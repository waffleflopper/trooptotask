import type { LayoutServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:training-data');
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'training',
		fn: async (ctx) => {
			const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId);
			const personnelTrainings = PersonnelTrainingEntity.fromDbArray(rows);

			return { personnelTrainings, orgId };
		}
	});
};
