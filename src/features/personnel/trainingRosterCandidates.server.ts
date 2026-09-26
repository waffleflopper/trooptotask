import type { SupabaseClient } from '@supabase/supabase-js';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelTrainingRosterCandidatesPort } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

export function createSupabasePersonnelTrainingRosterCandidatesPort(
	getAdminClient: () => SupabaseClient
): PersonnelTrainingRosterCandidatesPort {
	return {
		async listActiveCandidates(orgId, scopeSet) {
			const rows = await queryScopedPersonnelRows(getAdminClient, orgId, scopeSet, {
				select: PersonnelEntity.select,
				status: 'active'
			});
			return PersonnelEntity.fromDbArray(rows);
		}
	};
}
