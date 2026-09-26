import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelCalendarRosterPort, PersonnelRosterActor } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

async function requireCalendarRosterRead(actor: PersonnelRosterActor): Promise<void> {
	await requireFeaturePolicy(
		{ auth: actor },
		POLICY_ACTION_CATALOG.calendar.viewAvailability,
		{ kind: 'unscoped' },
		'personnel'
	);
}

export function createSupabasePersonnelCalendarRosterPort(
	getAdminClient: () => SupabaseClient
): PersonnelCalendarRosterPort {
	return {
		async listActive(actor) {
			await requireCalendarRosterRead(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: PersonnelEntity.select,
				status: 'active'
			});
			return PersonnelEntity.fromDbArray(rows);
		},
		async listAssigneeIds(actor) {
			await requireCalendarRosterRead(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, last_name, first_name',
				status: 'all'
			});
			return rows.map((row) => row.id as string);
		},
		async findGroupIds(actor, personnelIds) {
			await requireCalendarRosterRead(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, group_id, last_name, first_name',
				status: 'all',
				ids: personnelIds
			});
			return new Map(rows.map((row) => [row.id as string, (row.group_id as string | null) ?? null]));
		}
	};
}
