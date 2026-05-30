import type { PageServerLoad } from './$types';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { getAdminClient } from '$lib/server/supabase';
import { loadLogsSettings } from '../settingsLogs.server';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx) => {
		const adminStore = createSupabaseDataStore(getAdminClient());

		return {
			logsSettings: await loadLogsSettings(ctx, adminStore)
		};
	});
