import type { UseCaseContext } from '$lib/server/core/ports';
import type { Personnel, StatusType } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';

export interface SharedData {
	personnel: Personnel[];
	allPersonnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	trainingTypes: TrainingType[];
}

export async function fetchSharedData(ctx: UseCaseContext): Promise<SharedData> {
	ctx.auth.requireView('personnel');
	const orgId = ctx.auth.orgId;

	const [personnelRows, allPersonnelRows, groupRows, statusTypeRows, trainingTypeRows] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('training_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		})
	]);

	return {
		personnel: PersonnelEntity.fromDbArray(personnelRows),
		allPersonnel: PersonnelEntity.fromDbArray(allPersonnelRows),
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		trainingTypes: TrainingTypeEntity.fromDbArray(trainingTypeRows)
	};
}
