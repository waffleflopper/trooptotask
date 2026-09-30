import type { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';

type CompletionPolicyContext = Parameters<typeof requireFeaturePolicy>[0];

interface CompletionPolicyPorts {
	readonly auth: CompletionPolicyContext['auth'];
	readonly audit: NonNullable<CompletionPolicyContext['audit']>;
}

interface CompletionWriteStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
}

export interface PersonnelIctCompletionWriteContext extends CompletionPolicyPorts {
	readonly store: CompletionWriteStore;
	readonly personnelCriticalTasksRoster: Pick<PersonnelCriticalTasksRosterPort, 'findForCompletionWrite'>;
}

export interface IctCompletionBatchContext extends CompletionPolicyPorts {
	readonly store: Pick<CompletionWriteStore, 'insert' | 'update'> & {
		findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: { select?: string; inFilters?: Record<string, unknown[]> }
		): Promise<T[]>;
		insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;
	};
	readonly personnelCriticalTasksRoster?: Pick<PersonnelCriticalTasksRosterPort, 'listForBatchImport'>;
}
