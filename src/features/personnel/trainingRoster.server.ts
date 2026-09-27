import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelRosterActor, PersonnelTrainingRosterPort } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

export function createSupabasePersonnelTrainingRosterPort(
	getAdminClient: () => SupabaseClient
): PersonnelTrainingRosterPort {
	async function listActive(actor: PersonnelRosterActor, purpose: 'workspace' | 'reports') {
		await requireFeaturePolicy(
			{ auth: actor },
			purpose === 'workspace' ? POLICY_ACTION_CATALOG.training.viewMatrix : POLICY_ACTION_CATALOG.training.viewRecords,
			{ kind: 'unscoped' },
			'personnel'
		);
		const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
			select: PersonnelEntity.select,
			status: 'active'
		});
		return PersonnelEntity.fromDbArray(rows);
	}

	return {
		listActiveForWorkspace: (actor) => listActive(actor, 'workspace'),
		listActiveForReports: (actor) => listActive(actor, 'reports'),
		async findGroupIdsForWrites(actor, personnelIds) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.training.recordCompletions,
				{ kind: 'unscoped' },
				'personnel'
			);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, group_id, last_name, first_name',
				status: 'all',
				ids: personnelIds
			});
			return new Map(rows.map((row) => [row.id as string, (row.group_id as string | null) ?? null]));
		}
	};
}
