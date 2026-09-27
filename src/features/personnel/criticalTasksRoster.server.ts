import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelCriticalTasksRosterPort, PersonnelRosterActor } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

async function requireReadiness(actor: PersonnelRosterActor): Promise<void> {
	await requireFeaturePolicy(
		{ auth: actor },
		POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
		{ kind: 'unscoped' },
		'personnel'
	);
}

async function requireCompletionWrite(actor: PersonnelRosterActor): Promise<void> {
	await requireFeaturePolicy(
		{ auth: actor },
		POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
		{ kind: 'unscoped' },
		'personnel'
	);
}

export function createSupabasePersonnelCriticalTasksRosterPort(
	getAdminClient: () => SupabaseClient
): PersonnelCriticalTasksRosterPort {
	return {
		async listActiveForReadiness(actor) {
			await requireReadiness(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: PersonnelEntity.select,
				status: 'active'
			});
			return PersonnelEntity.fromDbArray(rows);
		},
		async findForHistory(actor, personnelId) {
			await requireReadiness(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: PersonnelEntity.select,
				status: 'all',
				ids: [personnelId]
			});
			return rows[0] ? PersonnelEntity.fromDb(rows[0]) : null;
		},
		async listForBatchImport(actor) {
			await requireCompletionWrite(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: PersonnelEntity.select,
				status: 'all'
			});
			return PersonnelEntity.fromDbArray(rows);
		},
		async findForCompletionWrite(actor, personnelId) {
			await requireCompletionWrite(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, group_id, archived_at, last_name, first_name',
				status: 'all',
				ids: [personnelId]
			});
			const row = rows[0];
			return row
				? { groupId: (row.group_id as string | null) ?? null, archivedAt: (row.archived_at as string | null) ?? null }
				: null;
		}
	};
}
