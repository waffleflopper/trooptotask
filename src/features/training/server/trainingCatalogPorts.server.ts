import type { requireFeaturePolicy } from '$lib/access/index.server';

type TrainingCatalogActor = Parameters<typeof requireFeaturePolicy>[0]['auth'];
type TrainingCatalogAudit = NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;

export interface TrainingCatalogReadStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: {
			orderBy?: Array<{ column: string; ascending: boolean }>;
			inFilters?: Record<string, unknown[]>;
			select?: string;
			limit?: number;
		}
	): Promise<T[]>;
	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: {
			select?: string;
			range?: { from: number; to: number };
			count?: 'exact' | 'planned' | 'estimated';
		}
	): Promise<{ data: T[]; count: number | null }>;
}

interface TrainingCatalogWriteStore extends TrainingCatalogReadStore {
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
}

export interface TrainingCatalogWriteContext {
	readonly auth: TrainingCatalogActor;
	readonly audit: TrainingCatalogAudit;
	readonly store: TrainingCatalogWriteStore;
}

export interface TrainingCatalogDeleteContext extends TrainingCatalogWriteContext {
	readonly notifyTrainingTypeDeleted: () => Promise<void>;
}
