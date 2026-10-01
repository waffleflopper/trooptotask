import type { requireFeaturePolicy } from '$lib/access/index.server';

/** Shared request reads for both CSV commands; each command adds only its own write. */
export interface PersonnelBatchContext {
	auth: Parameters<typeof requireFeaturePolicy>[0]['auth'];
	audit: NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;
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
