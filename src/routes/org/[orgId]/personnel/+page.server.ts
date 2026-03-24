import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchPersonnelPageData } from '$lib/server/core/useCases/personnelPageQuery';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core');
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'personnel',
		fn: async (ctx) => {
			const { pinnedGroups, ratingSchemeEntries } = await fetchPersonnelPageData(ctx);

			return {
				orgId,
				pinnedGroups,
				ratingSchemeEntries
			};
		}
	});
};
