import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';

interface RatingSchemeEntryReadStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
}

interface RatingSchemeEntryWriteStore extends RatingSchemeEntryReadStore {
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
}

export interface RatingSchemeEntryWriteContext {
	readonly auth: OrganizationAccessGrant;
	readonly audit: PolicyAuditSink;
	readonly store: RatingSchemeEntryWriteStore;
	/** The request's authenticated store retains Rating Scheme RLS independently of Personnel reads. */
	readonly rawStore?: RatingSchemeEntryReadStore;
	readonly personnelRatingSchemeRoster?: Pick<
		PersonnelRatingSchemeRosterPort,
		'findRatedPersonGroupForWrite' | 'hasEvaluatorReferences'
	>;
}

export interface RatingSchemeEntryDeleteContext extends RatingSchemeEntryWriteContext {
	readonly notifyRatingSchemeEntryDeleted: () => Promise<void>;
}
