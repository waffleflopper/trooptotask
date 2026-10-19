import type { Personnel } from '$features/personnel/contracts';
import type { CriticalTaskCompletionPersistence, CriticalTaskLibraryPersistence } from '../contracts';
import {
	buildPersonnelCriticalTaskReadiness,
	type PersonnelCriticalTaskReadiness
} from '../utils/personnelCriticalTaskItems';
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';

/** Critical Tasks owns the item read; delivery supplies the Person after Critical Tasks readiness admission. */
export async function loadPersonnelCriticalTaskReadiness(input: {
	organizationSettings: Parameters<typeof fetchCriticalTasksSettings>[0]['organizationSettings'];
	criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listCatalog'>;
	criticalTaskCompletions: Pick<CriticalTaskCompletionPersistence, 'listReadinessHistory'>;
	orgId: string;
	asOf: string;
	loadAuthorizedPerson: () => Promise<Personnel>;
}): Promise<PersonnelCriticalTaskReadiness> {
	const person = await input.loadAuthorizedPerson();
	const [tasks, completions, settings] = await Promise.all([
		input.criticalTaskLibrary.listCatalog(),
		input.criticalTaskCompletions.listReadinessHistory(person.id),
		fetchCriticalTasksSettings({ auth: { orgId: input.orgId }, organizationSettings: input.organizationSettings })
	]);
	return buildPersonnelCriticalTaskReadiness({ person, tasks, completions, settings, asOf: input.asOf });
}
