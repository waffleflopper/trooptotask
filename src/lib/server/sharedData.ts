import type { Personnel } from '$lib/types';
import type { StatusType } from '$features/calendar/calendar.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import {
	transformGroups,
	transformStatusTypes,
	transformTrainingTypes,
	transformPersonnelTrainings
} from '$lib/server/transforms';
import { queryPersonnel, personnelIds } from '$lib/server/personnelRepository';

const TRAINING_ROUTES = new Set(['training', 'onboarding', '']);

export function needsPersonnelTrainings(pathname: string, orgId: string): boolean {
	const segment = pathname.replace(`/org/${orgId}`, '').replace(/^\//, '').split('/')[0];
	return TRAINING_ROUTES.has(segment);
}

export interface SharedData {
	personnel: Personnel[];
	allPersonnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	trainingTypes: TrainingType[];
	personnelTrainings: PersonnelTraining[];
}

export async function fetchSharedData(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context (service role vs user)
	supabase: any,
	orgId: string,
	scopedGroupId: string | null,
	include?: { personnelTrainings?: boolean }
): Promise<SharedData> {
	const loadTrainings = include?.personnelTrainings ?? false;

	const [
		allPersonnelResult,
		scopedPersonnelResult,
		groupsRes,
		statusTypesRes,
		trainingTypesRes,
		personnelTrainingsRes
	] = await Promise.all([
		queryPersonnel({ supabase, orgId }),
		scopedGroupId ? queryPersonnel({ supabase, orgId, scopedGroupId }) : null,
		supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
		supabase.from('status_types').select('*').eq('organization_id', orgId).order('sort_order'),
		supabase.from('training_types').select('*').eq('organization_id', orgId).order('sort_order'),
		loadTrainings
			? supabase.from('personnel_trainings').select('*').eq('organization_id', orgId)
			: Promise.resolve({ data: [], error: null })
	]);

	const allPersonnel = allPersonnelResult.data;
	const personnel = scopedPersonnelResult ? scopedPersonnelResult.data : allPersonnel;

	const allTrainings = transformPersonnelTrainings(personnelTrainingsRes.data ?? []);
	let personnelTrainings = allTrainings;

	if (scopedGroupId) {
		const scopedIds = new Set(personnelIds(personnel));
		personnelTrainings = allTrainings.filter((pt) => scopedIds.has(pt.personnelId));
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
