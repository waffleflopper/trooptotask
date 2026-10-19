import type { Personnel } from '$features/personnel/contracts';
import type { TrainingCatalogPersistence, TrainingCompletionPersistence } from '../contracts';
import { buildPersonnelTrainingReadiness, type PersonnelTrainingReadiness } from '../utils/personnelTrainingItems';

/** Training owns the item read; delivery supplies the Person after Training view-records admission. */
export async function loadPersonnelTrainingReadiness(input: {
	trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypes'>;
	trainingCompletions: Pick<TrainingCompletionPersistence, 'listPersonCompletions' | 'listPersonHistory'>;
	asOf: string;
	loadAuthorizedPerson: () => Promise<Personnel>;
}): Promise<PersonnelTrainingReadiness> {
	const person = await input.loadAuthorizedPerson();
	const [types, completions, history] = await Promise.all([
		input.trainingCatalog.listTypes(),
		input.trainingCompletions.listPersonCompletions(person.id),
		input.trainingCompletions.listPersonHistory(person.id)
	]);
	return buildPersonnelTrainingReadiness({ person, types, completions, history, asOf: input.asOf });
}
