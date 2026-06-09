import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAudit } from '$lib/server/adapters/supabasePlatformAudit';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'audit',
	fn: async (ctx, event) => {
		const { url } = event;

		const page = parseInt(url.searchParams.get('page') || '1');
		const action = url.searchParams.get('action') || '';
		const severity = url.searchParams.get('severity') || '';
		const orgId = url.searchParams.get('org') || '';
		const limit = 50;

		return createSupabasePlatformAudit(ctx).listLogs({
			page,
			limit,
			action,
			severity,
			orgId
		});
	}
});
