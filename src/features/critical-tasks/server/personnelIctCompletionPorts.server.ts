import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PersonnelCriticalTasksRosterPort } from '$features/personnel/contracts';
import type { CriticalTaskLibraryPersistence, CriticalTaskCompletionPersistence } from '../contracts';

interface CompletionPolicyPorts {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
}

export interface PersonnelIctCompletionWriteContext extends CompletionPolicyPorts {
	readonly criticalTaskCompletions: Pick<
		CriticalTaskCompletionPersistence,
		'findReference' | 'create' | 'update' | 'delete'
	>;
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'findReference'>;
	readonly personnelCriticalTasksRoster: Pick<PersonnelCriticalTasksRosterPort, 'findForCompletionWrite'>;
}

export interface IctCompletionBatchContext extends CompletionPolicyPorts {
	readonly criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listImportCandidates'>;
	readonly criticalTaskCompletions: Pick<
		CriticalTaskCompletionPersistence,
		'listImportHistory' | 'createMany' | 'create' | 'update'
	>;
	readonly personnelCriticalTasksRoster?: Pick<PersonnelCriticalTasksRosterPort, 'listForBatchImport'>;
}
