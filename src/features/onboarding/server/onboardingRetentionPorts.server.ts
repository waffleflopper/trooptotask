/** Persistence consumed by the scheduled Onboarding retention rule. */
export interface OnboardingRetentionStore {
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: {
			select?: string;
			isNull?: Record<string, boolean>;
			rangeFilters?: Array<{ column: string; op: 'gte' | 'lte' | 'gt' | 'lt'; value: string }>;
		}
	): Promise<T[]>;
	/** Recheck eligibility in the parent DELETE; its existing FK cascades progress atomically. */
	deleteExpiredBatch(orgId: string, status: 'completed' | 'cancelled', ids: string[], cutoff: string): Promise<number>;
}
