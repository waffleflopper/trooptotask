export interface OnboardingRetentionStore {
	listExpired(orgId: string, status: 'completed' | 'cancelled', cutoff: string): Promise<Array<{ id: string }>>;
	deleteExpiredBatch(orgId: string, status: 'completed' | 'cancelled', ids: string[], cutoff: string): Promise<number>;
}
