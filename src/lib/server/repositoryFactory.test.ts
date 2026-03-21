import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createRepository, type RepositoryConfig } from './repositoryFactory';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

type TestItem = { id: string; name: string; sortOrder: number };

const testTransform = vi.fn((rows: Record<string, unknown>[]): TestItem[] =>
	rows.map((r) => ({
		id: r.id as string,
		name: r.name as string,
		sortOrder: r.sort_order as number
	}))
);

const testConfig: RepositoryConfig<TestItem> = {
	table: 'test_items',
	transform: testTransform,
	orderBy: [{ column: 'sort_order', ascending: true }]
};

function createMockSupabase(
	responseData: Record<string, unknown>[] | null = [],
	responseError: null | { message: string } = null
) {
	const calls: Record<string, unknown[][]> = {};

	function record(method: string) {
		return (...args: unknown[]) => {
			calls[method] = calls[method] ?? [];
			calls[method].push(args);
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: record('select'),
		eq: record('eq'),
		is: record('is'),
		not: record('not'),
		order: record('order'),
		range: record('range'),
		in: record('in'),
		gte: record('gte'),
		lte: record('lte'),
		ilike: record('ilike')
	};

	Object.defineProperty(builder, 'then', {
		value: (resolve: (val: unknown) => void) => {
			resolve({ data: responseData, error: responseError, count: responseData?.length ?? 0 });
		}
	});

	const supabase = {
		from: (table: string) => {
			calls['from'] = [[table]];
			return builder;
		},
		_calls: calls
	};

	return { supabase, calls };
}

describe('createRepository', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('list()', () => {
		it('queries correct table, applies org scoping, transform, and default sort', async () => {
			const rows = [
				{ id: 'g1', name: 'Alpha', sort_order: 0 },
				{ id: 'g2', name: 'Bravo', sort_order: 1 }
			];
			const { supabase, calls } = createMockSupabase(rows);
			const repo = createRepository(testConfig);

			const result = await repo.list(supabase, ORG_ID);

			// Queried correct table
			expect(calls['from']![0]).toEqual(['test_items']);
			// Default select
			expect(calls['select']![0]).toEqual(['*']);
			// Org scoping applied
			expect(calls['eq']![0]).toEqual(['organization_id', ORG_ID]);
			// Default sort applied
			expect(calls['order']![0]).toEqual(['sort_order', { ascending: true }]);
			// Transform called with raw rows
			expect(testTransform).toHaveBeenCalledWith(rows);
			// Returns transformed data
			expect(result).toEqual([
				{ id: 'g1', name: 'Alpha', sortOrder: 0 },
				{ id: 'g2', name: 'Bravo', sortOrder: 1 }
			]);
		});

		it('returns empty array when Supabase returns null data', async () => {
			const { supabase } = createMockSupabase(null);
			const repo = createRepository(testConfig);

			const result = await repo.list(supabase, ORG_ID);

			expect(result).toEqual([]);
			expect(testTransform).toHaveBeenCalledWith([]);
		});
	});

	describe('query()', () => {
		it('returns QueryResult shape with data, count, and null error', async () => {
			const rows = [{ id: 'g1', name: 'Alpha', sort_order: 0 }];
			const { supabase } = createMockSupabase(rows);
			const repo = createRepository(testConfig);

			const result = await repo.query(supabase, ORG_ID, { count: 'exact' });

			expect(result).toEqual({
				data: [{ id: 'g1', name: 'Alpha', sortOrder: 0 }],
				count: 1,
				error: null
			});
		});

		it('normalizes Supabase errors into error string', async () => {
			const { supabase } = createMockSupabase([], { message: 'connection failed' });
			const repo = createRepository(testConfig);

			const result = await repo.query(supabase, ORG_ID);

			expect(result.data).toEqual([]);
			expect(result.count).toBeNull();
			expect(result.error).toBe('connection failed');
		});

		it('accepts custom QueryModifier filters', async () => {
			const { supabase, calls } = createMockSupabase([]);
			const repo = createRepository(testConfig);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock query builder
			const searchFilter = (q: any) => q.ilike('name', '%alpha%');

			await repo.query(supabase, ORG_ID, { filters: [searchFilter] });

			expect(calls['ilike']![0]).toEqual(['name', '%alpha%']);
		});
	});

	describe('queryDateRange()', () => {
		it('applies gte/lte filters on the specified date column', async () => {
			const { supabase, calls } = createMockSupabase([]);
			const repo = createRepository(testConfig);

			await repo.queryDateRange(supabase, ORG_ID, {
				column: 'start_date',
				start: '2026-01-01',
				end: '2026-01-31'
			});

			expect(calls['gte']![0]).toEqual(['start_date', '2026-01-01']);
			expect(calls['lte']![0]).toEqual(['start_date', '2026-01-31']);
		});
	});

	describe('queryByIds()', () => {
		it('applies IN filter on specified column', async () => {
			const { supabase, calls } = createMockSupabase([]);
			const repo = createRepository(testConfig);

			await repo.queryByIds(supabase, ORG_ID, 'personnel_id', ['p1', 'p2']);

			expect(calls['in']![0]).toEqual(['personnel_id', ['p1', 'p2']]);
		});
	});

	describe('list() with options', () => {
		it('uses custom select override', async () => {
			const { supabase, calls } = createMockSupabase([]);
			const repo = createRepository(testConfig);

			await repo.list(supabase, ORG_ID, { select: 'id, name' });

			expect(calls['select']![0]).toEqual(['id, name']);
		});
	});
});
