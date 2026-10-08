import type { RankCatalogPersistence } from '$features/personnel/contracts';
import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { PersonnelRosterActor, PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';
import type {
	CriticalTaskLibraryPersistence,
	CriticalTaskCompletionPersistence,
	CriticalTasksReadModelPort
} from '../contracts';

export interface CriticalTasksHistoryContext {
	readonly auth: PersonnelRosterActor;
	readonly criticalTaskCompletions: Pick<CriticalTaskCompletionPersistence, 'listHistory'>;
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listReferenced'>;
	readonly personnelCriticalTasksRoster?: Pick<PersonnelCriticalTasksRosterPort, 'findForHistory'>;
}

export interface CriticalTasksReportContext {
	readonly auth: PersonnelRosterActor;
	readonly rankCatalog: Pick<RankCatalogPersistence, 'listEntries'>;
	readonly organizationSettings: Pick<OrganizationSettingsReader, 'findCriticalTasksDefaults'>;
	readonly criticalTaskCompletions: Pick<CriticalTaskCompletionPersistence, 'listReportHistory'>;
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listCatalog'>;
	readonly personnelCriticalTasksRoster: Pick<PersonnelCriticalTasksRosterPort, 'listActiveForReadiness'>;
	readonly criticalTasksReadModel: CriticalTasksReadModelPort;
}
