import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelOnboardingRosterPort, PersonnelRosterActor } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

async function requireOnboardingRosterRead(actor: PersonnelRosterActor): Promise<void> {
	await requireFeaturePolicy(
		{ auth: actor },
		POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
		{ kind: 'unscoped' },
		'personnel'
	);
}

export function createSupabasePersonnelOnboardingRosterPort(
	getAdminClient: () => SupabaseClient
): PersonnelOnboardingRosterPort {
	return {
		async listRoster(actor, status) {
			await requireOnboardingRosterRead(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: PersonnelEntity.select,
				status
			});
			return PersonnelEntity.fromDbArray(rows);
		},
		async findGroupIds(actor, personnelIds) {
			await requireOnboardingRosterRead(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, group_id, last_name, first_name',
				status: 'all',
				ids: personnelIds
			});
			return new Map(rows.map((row) => [row.id as string, (row.group_id as string | null) ?? null]));
		}
	};
}
