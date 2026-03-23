import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseDataStore } from './supabaseDataStore';
import type { SupabaseClient } from '@supabase/supabase-js';

type Call = { method: string; args: unknown[] };

function createMockQueryBuilder(returnData: unknown = null, returnError: unknown = null) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const result = { data: returnData, error: returnError };

	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		in: track('in'),
		order: track('order'),
		limit: track('limit'),
		insert: track('insert'),
		update: track('update'),
		delete: track('delete'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return result;
		},
		// Make builder thenable so `await query` resolves to {data, error}
		then: (resolve: (val: unknown) => void) => resolve(result)
	};

	return { builder, calls };
}

function createMockSupabase(builder: Record<string, unknown>): SupabaseClient {
	return {
		from: vi.fn(() => builder)
	} as unknown as SupabaseClient;
}

describe('SupabaseDataStore', () => {
	describe('findOne', () => {
		it('queries with org scoping and filters, returns single result', async () => {
			const row = { id: 'p-1', name: 'Alice', organization_id: 'org-1' };
			const { builder, calls } = createMockQueryBuilder(row);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.findOne<{ id: string; name: string }>('personnel', 'org-1', { id: 'p-1' }, 'id, name');

			expect(result).toEqual(row);
			expect(supabase.from as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('personnel');

			const methods = calls.map((c) => c.method);
			expect(methods).toContain('select');
			expect(methods).toContain('eq');
			expect(methods).toContain('single');

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['id', 'p-1'] });
		});

		it('returns null when no record found (PGRST116)', async () => {
			const { builder } = createMockQueryBuilder(null, { code: 'PGRST116', message: 'not found' });
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.findOne('personnel', 'org-1', { id: 'nonexistent' });
			expect(result).toBeNull();
		});

		it('throws on non-PGRST116 errors', async () => {
			const { builder } = createMockQueryBuilder(null, { code: '42P01', message: 'table not found' });
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await expect(store.findOne('bad_table', 'org-1', { id: 'x' })).rejects.toThrow('table not found');
		});
	});

	describe('findMany', () => {
		it('returns all records for an org with default select', async () => {
			const rows = [{ id: 'p-1' }, { id: 'p-2' }];
			const { builder, calls } = createMockQueryBuilder(rows);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.findMany('personnel', 'org-1');

			expect(result).toEqual(rows);
			expect(supabase.from as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('personnel');

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		});

		it('applies eq filters from both filters param and options.filters', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('records', 'org-1', { type: 'A' }, { filters: { status: 'active' } });

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['type', 'A'] });
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['status', 'active'] });
		});

		it('applies inFilters using .in()', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('records', 'org-1', undefined, {
				inFilters: { id: ['p-1', 'p-3'] }
			});

			const inCalls = calls.filter((c) => c.method === 'in');
			expect(inCalls).toContainEqual({ method: 'in', args: ['id', ['p-1', 'p-3']] });
		});

		it('applies orderBy', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('records', 'org-1', undefined, {
				orderBy: [
					{ column: 'name', ascending: true },
					{ column: 'created_at', ascending: false }
				]
			});

			const orderCalls = calls.filter((c) => c.method === 'order');
			expect(orderCalls).toHaveLength(2);
			expect(orderCalls[0]).toEqual({ method: 'order', args: ['name', { ascending: true }] });
			expect(orderCalls[1]).toEqual({ method: 'order', args: ['created_at', { ascending: false }] });
		});

		it('applies limit', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('records', 'org-1', undefined, { limit: 5 });

			const limitCalls = calls.filter((c) => c.method === 'limit');
			expect(limitCalls).toContainEqual({ method: 'limit', args: [5] });
		});

		it('applies custom select from options', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('records', 'org-1', undefined, { select: 'id, name' });

			const selectCalls = calls.filter((c) => c.method === 'select');
			expect(selectCalls[0]).toEqual({ method: 'select', args: ['id, name'] });
		});

		it('throws on Supabase error', async () => {
			const { builder } = createMockQueryBuilder(null, { message: 'query failed' });
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await expect(store.findMany('bad', 'org-1')).rejects.toThrow('query failed');
		});
	});

	describe('insert', () => {
		it('inserts with organization_id and returns the row', async () => {
			const row = { id: 'p-1', name: 'Alice', organization_id: 'org-1' };
			const { builder, calls } = createMockQueryBuilder(row);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.insert('personnel', 'org-1', { id: 'p-1', name: 'Alice' }, 'id, name');

			expect(result).toEqual(row);

			const insertCalls = calls.filter((c) => c.method === 'insert');
			expect(insertCalls[0].args[0]).toEqual({
				id: 'p-1',
				name: 'Alice',
				organization_id: 'org-1'
			});

			const selectCalls = calls.filter((c) => c.method === 'select');
			expect(selectCalls[0].args[0]).toBe('id, name');
		});

		it('throws on Supabase error', async () => {
			const { builder } = createMockQueryBuilder(null, { message: 'duplicate key' });
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await expect(store.insert('t', 'org-1', { id: 'x' })).rejects.toThrow('duplicate key');
		});
	});

	describe('update', () => {
		it('updates scoped by org and id, returns updated row', async () => {
			const row = { id: 'p-1', name: 'Bob', organization_id: 'org-1' };
			const { builder, calls } = createMockQueryBuilder(row);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.update('personnel', 'org-1', 'p-1', { name: 'Bob' }, 'id, name');

			expect(result).toEqual(row);

			const updateCalls = calls.filter((c) => c.method === 'update');
			expect(updateCalls[0].args[0]).toEqual({ name: 'Bob' });

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['id', 'p-1'] });
		});

		it('throws on Supabase error', async () => {
			const { builder } = createMockQueryBuilder(null, { message: 'not found' });
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await expect(store.update('t', 'org-1', 'x', { a: 1 })).rejects.toThrow('not found');
		});
	});

	describe('delete', () => {
		it('deletes scoped by org and id', async () => {
			const { builder, calls } = createMockQueryBuilder(null);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.delete('personnel', 'org-1', 'p-1');

			expect(supabase.from as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('personnel');

			const deleteCalls = calls.filter((c) => c.method === 'delete');
			expect(deleteCalls).toHaveLength(1);

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['id', 'p-1'] });
		});

		it('throws on Supabase error', async () => {
			const { builder } = createMockQueryBuilder(null, { message: 'delete failed' });
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await expect(store.delete('t', 'org-1', 'x')).rejects.toThrow('delete failed');
		});
	});

	describe('deleteWhere', () => {
		it('deletes with org scoping and additional filters', async () => {
			const { builder, calls } = createMockQueryBuilder(null);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.deleteWhere('records', 'org-1', { type_id: 'tt-1' });

			const deleteCalls = calls.filter((c) => c.method === 'delete');
			expect(deleteCalls).toHaveLength(1);

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['type_id', 'tt-1'] });
		});
	});

	describe('insertMany', () => {
		it('inserts multiple rows with organization_id and returns them', async () => {
			const rows = [
				{ id: 'p-1', name: 'Alice', organization_id: 'org-1' },
				{ id: 'p-2', name: 'Bob', organization_id: 'org-1' }
			];
			const { builder, calls } = createMockQueryBuilder(rows);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.insertMany(
				'personnel',
				'org-1',
				[
					{ id: 'p-1', name: 'Alice' },
					{ id: 'p-2', name: 'Bob' }
				],
				'id, name'
			);

			expect(result).toEqual(rows);

			const insertCalls = calls.filter((c) => c.method === 'insert');
			expect(insertCalls[0].args[0]).toEqual([
				{ id: 'p-1', name: 'Alice', organization_id: 'org-1' },
				{ id: 'p-2', name: 'Bob', organization_id: 'org-1' }
			]);
		});

		it('throws on Supabase error', async () => {
			const { builder } = createMockQueryBuilder(null, { message: 'batch insert failed' });
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await expect(store.insertMany('t', 'org-1', [{ id: 'x' }])).rejects.toThrow('batch insert failed');
		});
	});
});
