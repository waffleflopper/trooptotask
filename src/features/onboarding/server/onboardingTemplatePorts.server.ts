import type { requireFeaturePolicy } from '$lib/access/index.server';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';

type OnboardingTemplateActor = Parameters<typeof requireFeaturePolicy>[0]['auth'];
type OnboardingTemplateAudit = NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;

export interface OnboardingTemplateReadStore {
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

interface OnboardingTemplateWriteStore extends Pick<OnboardingTemplateReadStore, 'findOne' | 'findMany'> {
	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
	insertMany<T>(table: string, orgId: string, data: Record<string, unknown>[], select?: string): Promise<T[]>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
	deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;
}

export interface OnboardingTemplateReadContext {
	readonly auth: OnboardingTemplateActor;
	readonly store: Pick<OnboardingTemplateReadStore, 'findMany'>;
}

export interface OnboardingTemplateWriteContext extends OnboardingTemplateReadContext {
	readonly audit: OnboardingTemplateAudit;
	readonly store: OnboardingTemplateWriteStore;
	readonly trainingOnboardingReferences?: Pick<TrainingOnboardingReferencesPort, 'listTypes'>;
}
