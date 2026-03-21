import type { Personnel } from '$lib/types';
import type { StatusType } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import { queryPersonnel } from '$lib/server/personnelRepository';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { trainingTypeRepo } from '$lib/server/repositories';

export interface SharedData {
	personnel: Personnel[];
	allPersonnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	trainingTypes: TrainingType[];
}

export async function fetchSharedData(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context (service role vs user)
	supabase: any,
	orgId: string,
	scopedGroupId: string | null
): Promise<SharedData> {
	const [allPersonnelResult, scopedPersonnelResult, groups, statusTypes, trainingTypes] = await Promise.all([
		queryPersonnel({ supabase, orgId }),
		scopedGroupId ? queryPersonnel({ supabase, orgId, scopedGroupId }) : null,
		GroupEntity.repo.list(supabase, orgId),
		StatusTypeEntity.repo.list(supabase, orgId),
		trainingTypeRepo.list(supabase, orgId)
	]);

	if (allPersonnelResult.error) {
		console.error('Failed to fetch personnel:', allPersonnelResult.error);
	}
	if (scopedPersonnelResult?.error) {
		console.error('Failed to fetch scoped personnel:', scopedPersonnelResult.error);
	}

	const allPersonnel = allPersonnelResult.data;
	const personnel = scopedPersonnelResult ? scopedPersonnelResult.data : allPersonnel;

	return {
		personnel,
		allPersonnel,
		groups,
		statusTypes,
		trainingTypes
	};
}
