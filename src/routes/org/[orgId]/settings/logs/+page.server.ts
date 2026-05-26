import type { PageServerLoad } from './$types';
import { buildRouteContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { fetchAuditLogs } from '$lib/server/core/useCases/auditLogQuery';
import { getAdminClient } from '$lib/server/supabase';
import { actions, load as loadSettingsPage } from '../+page.server';

export { actions };

export const load: PageServerLoad = async (event) => {
	const settingsData = await loadSettingsPage(event as unknown as Parameters<typeof loadSettingsPage>[0]);
	const ctx = await buildRouteContext(event);
	const adminStore = createSupabaseDataStore(getAdminClient());

	const auditLogPage = await fetchAuditLogs(ctx, adminStore, {
		page: 1,
		limit: 100
	});

	return {
		...settingsData,
		auditLogPage
	};
};
