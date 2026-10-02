/** Request-owned persistence supplied by delivery; each Rating operation accepts only the method it needs. */
export interface RatingSchemeReadStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: { select?: string; orderBy?: Array<{ column: string; ascending: boolean }> }
	): Promise<T[]>;
	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: { select?: string; range?: { from: number; to: number }; count?: 'exact' | 'planned' | 'estimated' }
	): Promise<{ data: T[]; count: number | null }>;
}
