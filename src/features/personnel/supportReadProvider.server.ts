import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonnelSupportReader } from './supportReadTypes';

function readCount(value: number | string | null): number {
	const count = typeof value === 'number' ? value : Number(value);
	if (value === null || (typeof value === 'string' && value.trim() === '') || !Number.isSafeInteger(count) || count < 0)
		throw new Error('Active personnel count was unavailable');
	return count;
}

/** Bound after platform support admission; Personnel retains the active-roster predicate. */
export function createPersonnelSupportReader(client: SupabaseClient): PersonnelSupportReader {
	return {
		async countActivePersonnelByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return new Map();
			const { data, error } = (await client.rpc('count_personnel_by_organization', { p_org_ids: ids })) as {
				data: Array<{ organization_id: string; personnel_count: number | string | null }> | null;
				error: unknown;
			};
			if (error) throw error;
			const requested = new Set(ids);
			return new Map(
				(data ?? [])
					.filter((row) => requested.has(row.organization_id))
					.map((row) => [row.organization_id, readCount(row.personnel_count)])
			);
		},
		async countActivePersonnelForOrganization(organizationId) {
			const { count, error } = await client
				.from('personnel')
				.select('*', { count: 'exact', head: true })
				.eq('organization_id', organizationId)
				.is('archived_at', null);
			if (error) throw error;
			return readCount(count ?? null);
		}
	};
}
