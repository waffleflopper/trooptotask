import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';
import type { CriticalTaskLibraryPersistence } from '../contracts';

interface CompletionPolicyPorts {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
}

interface CompletionWriteStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
}

export interface PersonnelIctCompletionWriteContext extends CompletionPolicyPorts {
	readonly store: CompletionWriteStore;
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'findReference'>;
	readonly personnelCriticalTasksRoster: Pick<PersonnelCriticalTasksRosterPort, 'findForCompletionWrite'>;
}

export interface IctCompletionBatchContext extends CompletionPolicyPorts {
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listImportCandidates'>;
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
