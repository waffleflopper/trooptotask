import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import type { Personnel } from '$lib/types';

export interface TrainingBootstrap {
	personnelTrainings: Promise<PersonnelTraining[]>;
	trainingTypes: TrainingType[];
	trainingViews: TrainingView[];
	personnel: Personnel[];
}
