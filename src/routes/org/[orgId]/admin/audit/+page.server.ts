import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { getAdminClient } from '$lib/server/supabase';
import { fetchAuditLogs } from '$lib/server/core/useCases/auditLogQuery';

export const load: PageServerLoad = async ({ params, locals, cookies, url }) => {
	const { orgId } = params;

	const page = parseInt(url.searchParams.get('page') || '1');
	const action = url.searchParams.get('action') || '';

	return loadWithContext(locals, cookies, orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			const adminStore = createSupabaseDataStore(getAdminClient());
			return fetchAuditLogs(ctx, adminStore, { page, action: action || undefined });
		}
	});
};
