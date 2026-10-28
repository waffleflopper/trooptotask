import type { SupabaseClient } from '$lib/server/database';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { PERSONNEL_FIELDS, toPersonnel } from './personnelPersistenceMapping.server';
import type { PersonnelRosterActor, PersonnelTrainingRosterPort } from './contracts';
import { queryScopedPersonnelRows, toPersonnelWriteSubject } from './scopedRosterQuery.server';

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
			select: PERSONNEL_FIELDS,
			status: 'active'
		});
		return rows.map(toPersonnel);
	}

	return {
		listActiveForWorkspace: (actor) => listActive(actor, 'workspace'),
		listActiveForReports: (actor) => listActive(actor, 'reports'),
		async findWriteSubjects(actor, personnelIds) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.training.recordCompletions,
				{ kind: 'unscoped' },
				'personnel'
			);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, group_id, rank, last_name',
				status: 'all',
				ids: personnelIds
			});
			return new Map(rows.map((row) => [row.id as string, toPersonnelWriteSubject(row)]));
		}
	};
}
