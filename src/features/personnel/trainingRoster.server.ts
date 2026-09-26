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
		listActiveForReports: (actor) => listActive(actor, 'reports')
	};
}
