import type { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';

type RatingSchemeEntryActor = Parameters<typeof requireFeaturePolicy>[0]['auth'];
type RatingSchemeEntryAudit = NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;

interface RatingSchemeEntryReadStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
}

interface RatingSchemeEntryWriteStore extends RatingSchemeEntryReadStore {
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
}

export interface RatingSchemeEntryWriteContext {
	readonly auth: RatingSchemeEntryActor;
	readonly audit: RatingSchemeEntryAudit;
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
