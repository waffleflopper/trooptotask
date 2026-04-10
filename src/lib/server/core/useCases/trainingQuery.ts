import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { HydrationItems } from '$lib/server/core/orgShell';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

export interface TrainingBootstrap {
	personnelTrainings: HydrationItems<PersonnelTraining>;
	trainingTypes: HydrationItems<TrainingType>;
	trainingViews: HydrationItems<TrainingView>;
	personnel: HydrationItems<Personnel>;
	groups: HydrationItems<Group>;
	pinnedGroups: HydrationItems<string>;
}
