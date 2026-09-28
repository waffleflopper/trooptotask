import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';

export interface AssignmentTypeRetentionPort {
	deleteExpiredUnreferenced(orgId: string, ids: string[], cutoff: string): Promise<number>;
}

/** Retain every type with a saved assignment, including archived historical types. */
export async function cleanupExpiredAssignmentTypes(
	store: CalendarWritePorts['store'],
	retention: AssignmentTypeRetentionPort,
	orgId: string,
	cutoff: string
): Promise<number> {
	const candidates = await store.findMany<{ id: string }>('assignment_types', orgId, undefined, {
		select: 'id',
		rangeFilters: [{ column: 'archived_at', op: 'lt', value: cutoff }],
		isNull: { archived_at: false }
	});
	if (candidates.length === 0) return 0;
	return retention.deleteExpiredUnreferenced(
		orgId,
		candidates.map((row) => row.id),
		cutoff
	);
}

/** The database locks each type before checking Calendar references and deleting it. */
export function createSupabaseAssignmentTypeRetention(client: SupabaseClient) {
	return {
		async deleteExpiredUnreferenced(orgId: string, ids: string[], cutoff: string): Promise<number> {
			if (ids.length === 0) return 0;
			const { data, error } = await client.rpc('delete_expired_unreferenced_assignment_types', {
				p_org_id: orgId,
				p_candidate_ids: ids,
				p_cutoff: cutoff
			});
			if (error) throw new Error(error.message);
			if (typeof data !== 'number') throw new Error('Assignment type retention returned no deletion count');
			return data;
		}
	};
}
