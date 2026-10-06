import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonnelSupportReader } from './supportReadTypes';

function readCount(value: unknown): number {
	if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value)))
		throw new Error('Active personnel count was unavailable');
	const count = Number(value);
	if (!Number.isSafeInteger(count) || count < 0) throw new Error('Active personnel count was unavailable');
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
			if (!Array.isArray(data)) throw new Error('Active personnel count was unavailable');
			const requested = new Map(ids.map((value) => [value.toLowerCase(), value]));
			const counts = new Map<string, number>();
			for (const value of data) {
				if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.organization_id !== 'string')
					throw new Error('Active personnel count was unavailable');
				const organizationId = requested.get(value.organization_id.toLowerCase());
				if (!organizationId || counts.has(organizationId)) throw new Error('Active personnel count was unavailable');
				counts.set(organizationId, readCount(value.personnel_count));
			}
			return counts;
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
