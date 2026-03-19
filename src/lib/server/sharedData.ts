import type { Personnel } from '$lib/types';
import type { StatusType } from '$features/calendar/calendar.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import {
	transformPersonnel,
	transformGroups,
	transformStatusTypes,
	transformTrainingTypes,
	transformPersonnelTrainings
} from '$lib/server/transforms';

export interface SharedData {
	personnel: Personnel[];
	allPersonnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	trainingTypes: TrainingType[];
	personnelTrainings: PersonnelTraining[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context (service role vs user)
export async function fetchSharedData(supabase: any, orgId: string, scopedGroupId: string | null): Promise<SharedData> {
	const [personnelRes, groupsRes, statusTypesRes, trainingTypesRes, personnelTrainingsRes] = await Promise.all([
		supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('organization_id', orgId)
			.is('archived_at', null)
			.order('last_name'),
		supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
		supabase.from('status_types').select('*').eq('organization_id', orgId).order('sort_order'),
		supabase.from('training_types').select('*').eq('organization_id', orgId).order('sort_order'),
		supabase.from('personnel_trainings').select('*').eq('organization_id', orgId)
	]);

	const allPersonnel = transformPersonnel(personnelRes.data ?? []);
	const allTrainings = transformPersonnelTrainings(personnelTrainingsRes.data ?? []);

	let personnel = allPersonnel;
	let personnelTrainings = allTrainings;

	if (scopedGroupId) {
		const scopedPersonnelIds = new Set(allPersonnel.filter((p) => p.groupId === scopedGroupId).map((p) => p.id));
		personnel = allPersonnel.filter((p) => p.groupId === scopedGroupId);
		personnelTrainings = allTrainings.filter((pt) => scopedPersonnelIds.has(pt.personnelId));
	}

	return {
		personnel,
		allPersonnel,
		groups: transformGroups(groupsRes.data ?? []),
		statusTypes: transformStatusTypes(statusTypesRes.data ?? []),
		trainingTypes: transformTrainingTypes(trainingTypesRes.data ?? []),
		personnelTrainings
	};
}
