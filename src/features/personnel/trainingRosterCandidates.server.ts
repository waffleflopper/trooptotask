import type { SupabaseClient } from '@supabase/supabase-js';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelTrainingRosterCandidatesPort } from './contracts';

const CANDIDATE_PAGE_SIZE = 500;

export function createSupabasePersonnelTrainingRosterCandidatesPort(
	getAdminClient: () => SupabaseClient
): PersonnelTrainingRosterCandidatesPort {
	return {
		async listActiveCandidates(orgId, scopeSet) {
			if (scopeSet.kind === 'groups' && scopeSet.groupIds.length === 0) return [];
			const adminClient = getAdminClient();
			const rows: Record<string, unknown>[] = [];
			for (let offset = 0; ; offset += CANDIDATE_PAGE_SIZE) {
				let query = adminClient
					.from('personnel')
					.select(PersonnelEntity.select)
					.eq('organization_id', orgId)
					.is('archived_at', null);

				if (scopeSet.kind === 'groups') {
					query = query.in('group_id', scopeSet.groupIds);
				}

				const { data, error } = await query
					.order('last_name', { ascending: true })
					.order('first_name', { ascending: true })
					.order('id', { ascending: true })
					.range(offset, offset + CANDIDATE_PAGE_SIZE - 1);

				if (error) throw new Error(error.message);
				const page = (data ?? []) as unknown as Record<string, unknown>[];
				rows.push(...page);
				if (page.length < CANDIDATE_PAGE_SIZE) break;
			}
			return PersonnelEntity.fromDbArray(rows);
		}
	};
}
