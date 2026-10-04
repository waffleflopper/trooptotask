import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';

/** Shared request reads for both CSV commands; each command adds only its own write. */
export interface PersonnelBatchContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	store: {
		findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: {
				select?: string;
				isNull?: Record<string, boolean>;
				orderBy?: Array<{ column: string; ascending: boolean }>;
				inFilters?: Record<string, string[]>;
			}
		): Promise<T[]>;
	};
	rawStore?: Pick<PersonnelBatchContext['store'], 'findMany'>;
}
