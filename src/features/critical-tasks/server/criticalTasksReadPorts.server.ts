import type { PersonnelRosterActor, PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';
import type { CriticalTasksReadModelPort } from '../contracts';

export interface CriticalTasksReadStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: {
			select?: string;
			isNull?: Record<string, boolean>;
			inFilters?: Record<string, string[]>;
			orderBy?: Array<{ column: string; ascending: boolean }>;
		}
	): Promise<T[]>;
}

export interface CriticalTasksHistoryContext {
	readonly auth: PersonnelRosterActor;
	readonly store: CriticalTasksReadStore;
	readonly personnelCriticalTasksRoster?: Pick<PersonnelCriticalTasksRosterPort, 'findForHistory'>;
}

export interface CriticalTasksReportContext {
	readonly auth: PersonnelRosterActor;
	readonly store: CriticalTasksReadStore;
	readonly personnelCriticalTasksRoster?: Pick<PersonnelCriticalTasksRosterPort, 'listActiveForReadiness'>;
	readonly criticalTasksReadModel: CriticalTasksReadModelPort;
}
