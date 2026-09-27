import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelCalendarRosterPort, PersonnelRosterActor } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

// Targeted IDs travel in a PostgREST URL. A 500-Person Calendar batch needs
// smaller lookups so the provider does not reject the request as URI too long.
const TARGETED_LOOKUP_SIZE = 100;

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
			const uniqueIds = [...new Set(personnelIds)];
			if (uniqueIds.length === 0 || (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)) {
				return new Map();
			}
			const lookups = [];
			for (let start = 0; start < uniqueIds.length; start += TARGETED_LOOKUP_SIZE) {
				lookups.push(
					queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
						select: 'id, group_id, last_name, first_name',
						status: 'all',
						ids: uniqueIds.slice(start, start + TARGETED_LOOKUP_SIZE)
					})
				);
			}
			const pages = await Promise.all(lookups);
			return new Map(pages.flat().map((row) => [row.id as string, (row.group_id as string | null) ?? null]));
		}
	};
}
