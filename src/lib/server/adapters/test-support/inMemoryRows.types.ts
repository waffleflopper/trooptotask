export interface FixtureFindOptions {
	orderBy?: Array<{ column: string; ascending: boolean }>;
	filters?: Record<string, unknown>;
	inFilters?: Record<string, unknown[]>;
	notInFilters?: Record<string, unknown[]>;
	select?: string;
	limit?: number;
	/** Null-check filters: { archived_at: true } means IS NULL, false means IS NOT NULL */
	isNull?: Record<string, boolean>;
	rangeFilters?: Array<{ column: string; op: 'gte' | 'lte' | 'gt' | 'lt'; value: string }>;
	/** Case-insensitive LIKE filters: { title: '%search%' } */
	ilikeFilters?: Record<string, string>;
	/** Pagination range (0-indexed, inclusive) */
	range?: { from: number; to: number };
	count?: 'exact' | 'planned' | 'estimated';
}

export interface FixtureFindResult<T> {
	data: T[];
	count: number | null;
}

export type FixtureGroupScopeRule =
	| { type: 'group'; groupColumn: string }
	| { type: 'personnel'; personnelColumn: string };

export interface FixtureRowStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;

	findMany<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FixtureFindOptions
	): Promise<T[]>;

	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;

	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;

	/** Update a row by primary key only, without organization_id scoping.
	 *  Use for tables like `organizations` where the row IS the org. */
	updateById<T>(table: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;

	delete(table: string, orgId: string, id: string): Promise<void>;

	deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;

	deleteWhereAny(table: string, orgId: string, filterGroups: Array<Record<string, unknown>>): Promise<void>;

	deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number>;

	insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;

	upsertMany<T>(
		table: string,
		orgId: string,
		rows: Record<string, unknown>[],
		options: { onConflict: string; select?: string }
	): Promise<T[]>;

	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FixtureFindOptions
	): Promise<FixtureFindResult<T>>;
}
