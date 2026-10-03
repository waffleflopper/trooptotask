import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { OrganizationRetentionSettingsReader } from './settingsTypes';

/** Bind after cron admission. Complete discovery precedes every resource owner's cleanup. */
export function createSupabaseOrganizationRetentionSettingsReader(
	client: SupabaseClient
): OrganizationRetentionSettingsReader {
	return {
		async listConfigurations() {
			const result = await selectAllSupabaseRows<{ id: string; archive_retention_months?: number | null }>(
				async (from, to) => {
					const { data, error } = await client
						.from('organizations')
						.select('id,archive_retention_months')
						.order('id', { ascending: true })
						.range(from, to);
					return { data, error };
				}
			);
			if (result.error) {
				throw new Error(
					(result.error as { message?: string }).message ?? 'Organization retention settings read failed'
				);
			}
			return (result.data ?? []).map((row) => ({ id: row.id, retentionMonths: row.archive_retention_months }));
		}
	};
}
