import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore } from './inMemory';

describe('InMemoryDataStore — enriched FindOptions', () => {
	describe('isNull', () => {
		it('filters rows where column IS null when isNull is true', async () => {
			const store = createInMemoryDataStore();
			store.seed('people', [
				{ id: '1', organization_id: 'org-1', name: 'Alice', archived_at: null },
				{ id: '2', organization_id: 'org-1', name: 'Bob', archived_at: '2026-01-01' }
			]);

			const results = await store.findMany<{ id: string; name: string }>('people', 'org-1', undefined, {
				isNull: { archived_at: true }
			});

			expect(results).toHaveLength(1);
			expect(results[0].name).toBe('Alice');
		});

		it('filters rows where column IS NOT null when isNull is false', async () => {
			const store = createInMemoryDataStore();
			store.seed('people', [
				{ id: '1', organization_id: 'org-1', name: 'Alice', archived_at: null },
				{ id: '2', organization_id: 'org-1', name: 'Bob', archived_at: '2026-01-01' }
			]);

			const results = await store.findMany<{ id: string; name: string }>('people', 'org-1', undefined, {
				isNull: { archived_at: false }
			});

			expect(results).toHaveLength(1);
			expect(results[0].name).toBe('Bob');
		});
	});

	describe('rangeFilters', () => {
		it('filters with gte operator', async () => {
			const store = createInMemoryDataStore();
			store.seed('events', [
				{ id: '1', organization_id: 'org-1', date: '2026-01-01' },
				{ id: '2', organization_id: 'org-1', date: '2026-06-15' },
				{ id: '3', organization_id: 'org-1', date: '2026-12-31' }
			]);

			const results = await store.findMany<{ id: string }>('events', 'org-1', undefined, {
				rangeFilters: [{ column: 'date', op: 'gte', value: '2026-06-15' }]
			});

			expect(results).toHaveLength(2);
			expect(results.map((r) => r.id)).toContain('2');
			expect(results.map((r) => r.id)).toContain('3');
		});

		it('filters with lte operator', async () => {
			const store = createInMemoryDataStore();
			store.seed('events', [
				{ id: '1', organization_id: 'org-1', date: '2026-01-01' },
				{ id: '2', organization_id: 'org-1', date: '2026-06-15' },
				{ id: '3', organization_id: 'org-1', date: '2026-12-31' }
			]);

			const results = await store.findMany<{ id: string }>('events', 'org-1', undefined, {
				rangeFilters: [{ column: 'date', op: 'lte', value: '2026-06-15' }]
			});

			expect(results).toHaveLength(2);
			expect(results.map((r) => r.id)).toContain('1');
			expect(results.map((r) => r.id)).toContain('2');
		});

		it('filters with gt and lt operators', async () => {
			const store = createInMemoryDataStore();
			store.seed('events', [
				{ id: '1', organization_id: 'org-1', score: 10 },
				{ id: '2', organization_id: 'org-1', score: 20 },
				{ id: '3', organization_id: 'org-1', score: 30 }
			]);

			const results = await store.findMany<{ id: string }>('events', 'org-1', undefined, {
				rangeFilters: [
					{ column: 'score', op: 'gt', value: '10' },
					{ column: 'score', op: 'lt', value: '30' }
				]
			});

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe('2');
		});
	});

	describe('range (pagination)', () => {
		it('returns a slice of results based on from/to', async () => {
			const store = createInMemoryDataStore();
			store.seed('items', [
				{ id: '1', organization_id: 'org-1', name: 'A' },
				{ id: '2', organization_id: 'org-1', name: 'B' },
				{ id: '3', organization_id: 'org-1', name: 'C' },
				{ id: '4', organization_id: 'org-1', name: 'D' },
				{ id: '5', organization_id: 'org-1', name: 'E' }
			]);

			const results = await store.findMany<{ id: string }>('items', 'org-1', undefined, {
				range: { from: 1, to: 3 }
			});

			expect(results).toHaveLength(3);
			expect(results.map((r) => r.id)).toEqual(['2', '3', '4']);
		});
	});
});

describe('InMemoryDataStore — findManyWithCount', () => {
	it('returns data and total count', async () => {
		const store = createInMemoryDataStore();
		store.seed('items', [
			{ id: '1', organization_id: 'org-1', name: 'A' },
			{ id: '2', organization_id: 'org-1', name: 'B' },
			{ id: '3', organization_id: 'org-1', name: 'C' }
		]);

		const result = await store.findManyWithCount<{ id: string }>('items', 'org-1');

		expect(result.data).toHaveLength(3);
		expect(result.count).toBe(3);
	});

	it('returns total count even with limit applied', async () => {
		const store = createInMemoryDataStore();
		store.seed('items', [
			{ id: '1', organization_id: 'org-1', name: 'A' },
			{ id: '2', organization_id: 'org-1', name: 'B' },
			{ id: '3', organization_id: 'org-1', name: 'C' },
			{ id: '4', organization_id: 'org-1', name: 'D' }
		]);

		const result = await store.findManyWithCount<{ id: string }>('items', 'org-1', undefined, {
			limit: 2
		});

		expect(result.data).toHaveLength(2);
		expect(result.count).toBe(4);
	});

	it('returns total count even with range applied', async () => {
		const store = createInMemoryDataStore();
		store.seed('items', [
			{ id: '1', organization_id: 'org-1', name: 'A' },
			{ id: '2', organization_id: 'org-1', name: 'B' },
			{ id: '3', organization_id: 'org-1', name: 'C' },
			{ id: '4', organization_id: 'org-1', name: 'D' },
			{ id: '5', organization_id: 'org-1', name: 'E' }
		]);

		const result = await store.findManyWithCount<{ id: string }>('items', 'org-1', undefined, {
			range: { from: 0, to: 1 }
		});

		expect(result.data).toHaveLength(2);
		expect(result.count).toBe(5);
	});

	it('respects filters in the count', async () => {
		const store = createInMemoryDataStore();
		store.seed('items', [
			{ id: '1', organization_id: 'org-1', status: 'active' },
			{ id: '2', organization_id: 'org-1', status: 'active' },
			{ id: '3', organization_id: 'org-1', status: 'archived' }
		]);

		const result = await store.findManyWithCount<{ id: string }>('items', 'org-1', { status: 'active' });

		expect(result.data).toHaveLength(2);
		expect(result.count).toBe(2);
	});
});
