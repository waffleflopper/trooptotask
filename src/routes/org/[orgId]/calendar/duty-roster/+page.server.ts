import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchRosterHistory } from '$lib/server/core/useCases/rosterHistoryQuery';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const rosterHistory = await fetchRosterHistory(ctx);
			return { rosterHistory };
		}
	});
};
