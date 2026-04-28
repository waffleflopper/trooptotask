import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { DeletionRequestRow } from '../settingsRows.server';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	return loadWithContext(locals, cookies, params.orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			const requests = await ctx.store.findMany<DeletionRequestRow>('deletion_requests', ctx.auth.orgId, undefined, {
				orderBy: [{ column: 'created_at', ascending: false }]
			});

			return { requests };
		}
	});
};
