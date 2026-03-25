import type { LayoutServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import type { PersonnelTraining } from '$features/training/training.types';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:training-data');
	const { orgId } = params;

	const { data: personnelTrainings } = await loadWithContext(locals, cookies, orgId, {
		permission: 'training',
		defer: true,
		fn: async (ctx) => {
			const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId);
			return PersonnelTrainingEntity.fromDbArray(rows) as PersonnelTraining[];
		}
	});

	return { personnelTrainings, orgId };
};
