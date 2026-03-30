import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';

export interface PersonnelBootstrap {
	personnel: Personnel[];
	allPersonnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
}

export async function fetchPersonnelBootstrap(ctx: QueryWithRawStorePorts): Promise<PersonnelBootstrap> {
	const orgId = ctx.auth.orgId;
	const findOptions = {
		select: PersonnelEntity.select,
		orderBy: [{ column: 'last_name', ascending: true }],
		isNull: { archived_at: true }
	};

	const [personnelRows, allPersonnelRows, groupRows, statusTypeRows] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, findOptions),
		ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, findOptions),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		})
	]);

	return {
		personnel: PersonnelEntity.fromDbArray(personnelRows),
		allPersonnel: PersonnelEntity.fromDbArray(allPersonnelRows),
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows)
	};
}
