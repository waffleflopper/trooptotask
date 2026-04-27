import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';

type DeletionRequestStatus = 'pending' | 'approved' | 'denied';

interface DeletionRequestRow {
	id: string;
	status: DeletionRequestStatus;
	requester_email: string | null;
	resource_description: string | null;
	resource_type: string;
	resource_url: string | null;
	created_at: string;
	denial_reason: string | null;
}

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
