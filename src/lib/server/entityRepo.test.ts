import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { field, defineEntity } from './entitySchema';

// Mock Supabase client that returns specified rows
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockSupabase(rows: Record<string, unknown>[]): any {
	const chain = {
		eq: function () {
			return chain;
		},
		order: function () {
			return chain;
		},
		gte: function () {
			return chain;
		},
		lte: function () {
			return chain;
		},
		in: function () {
			return chain;
		},
		limit: function () {
			return chain;
		},
		then: function (resolve: (val: unknown) => void) {
			resolve({ data: rows, error: null, count: rows.length });
		}
	};
	return {
		from: () => ({
			select: () => chain
		})
	};
}

function createTestEntity(overrides = {}) {
	return defineEntity({
		table: 'test_records',
		groupScope: 'none',
		schema: {
			id: field(z.string(), { readOnly: true }),
			fullName: field(z.string(), { column: 'full_name' }),
			score: field(z.number().nullable(), { nullDefault: 0 })
		},
		...overrides
	});
}

const ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('entity repo list()', () => {
	it('returns transformed data using fromDbArray', async () => {
		const mockSupabase = createMockSupabase([
			{ id: '1', full_name: 'Alice', score: 90 },
			{ id: '2', full_name: 'Bob', score: null }
		]);

		const entity = createTestEntity();
		const results = await entity.repo.list(mockSupabase, ORG_ID);

		expect(results).toEqual([
			{ id: '1', fullName: 'Alice', score: 90 },
			{ id: '2', fullName: 'Bob', score: 0 } // nullDefault applied
		]);
	});
});

describe('entity repo query()', () => {
	it('returns QueryResult with count', async () => {
		const mockSupabase = createMockSupabase([{ id: '1', full_name: 'Alice', score: 90 }]);

		const entity = createTestEntity();
		const result = await entity.repo.query(mockSupabase, ORG_ID, { count: 'exact' });

		expect(result.data).toEqual([{ id: '1', fullName: 'Alice', score: 90 }]);
		expect(result.count).toBe(1);
		expect(result.error).toBeNull();
	});
});

describe('entity repo orderBy/select passthrough', () => {
	it('passes orderBy to repository', async () => {
		const selectSpy = vi.fn();
		const orderSpy = vi.fn();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mockSupabase: any = {
			from: () => ({
				select: (...args: unknown[]) => {
					selectSpy(...args);
					const chain = {
						eq: function () {
							return chain;
						},
						order: (...oArgs: unknown[]) => {
							orderSpy(...oArgs);
							return chain;
						},
						then: (resolve: (val: unknown) => void) => {
							resolve({ data: [], error: null, count: 0 });
						}
					};
					return chain;
				}
			})
		};

		const entity = createTestEntity({
			orderBy: [{ column: 'full_name', ascending: true }],
			select: 'id, full_name'
		});

		await entity.repo.list(mockSupabase, ORG_ID);

		expect(selectSpy).toHaveBeenCalledWith('id, full_name');
		expect(orderSpy).toHaveBeenCalledWith('full_name', { ascending: true });
	});
});

describe('entity repo customTransform', () => {
	it('uses customTransform instead of auto fromDbArray', async () => {
		const mockSupabase = createMockSupabase([{ id: '1', full_name: 'Alice', score: 90 }]);

		const entity = defineEntity({
			table: 'test_records',
			groupScope: 'none',
			schema: {
				id: field(z.string(), { readOnly: true }),
				fullName: field(z.string(), { column: 'full_name' }),
				score: field(z.number().nullable(), { nullDefault: 0 })
			},
			customTransform: (row) => ({
				label: `${row.full_name} (${row.score})`
			})
		});

		const results = await entity.repo.list(mockSupabase, ORG_ID);

		expect(results).toEqual([{ label: 'Alice (90)' }]);
	});
});
