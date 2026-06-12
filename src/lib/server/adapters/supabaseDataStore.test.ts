import { describe, it, expect, vi } from 'vitest';
import { createSupabaseDataStore } from './supabaseDataStore';
import type { SupabaseClient } from '@supabase/supabase-js';

type Call = { method: string; args: unknown[] };

function createMockQueryBuilder(returnData: unknown = null, returnError: unknown = null, calls: Call[] = []) {
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
		is: track('is'),
		or: track('or'),
		in: track('in'),
		not: track('not'),
		order: track('order'),
		range: track('range'),
		limit: track('limit'),
		insert: track('insert'),
		upsert: track('upsert'),
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

function createMockSupabaseWithRpc(
	data: Array<{ action: string | null }> | null,
	error: { message?: string } | null = null
): SupabaseClient & { rpc: ReturnType<typeof vi.fn> } {
	return {
		from: vi.fn(),
		rpc: vi.fn(async () => ({ data, error }))
	} as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

function createPagedMockSupabase(results: Array<{ data: unknown; error?: unknown; count?: number | null }>): {
	supabase: SupabaseClient;
	calls: Call[];
	fromCalls: ReturnType<typeof vi.fn>;
} {
	const calls: Call[] = [];
	let index = 0;
	const fromCalls = vi.fn(() => {
		const current = results[Math.min(index, results.length - 1)] ?? { data: [], error: null, count: null };
		index += 1;
		const { builder } = createMockQueryBuilder(current.data, current.error ?? null, calls);
		builder.then = (resolve: (val: unknown) => void) =>
			resolve({ data: current.data, error: current.error ?? null, count: current.count ?? null });
		return builder;
	});

	return {
		supabase: { from: fromCalls } as unknown as SupabaseClient,
		calls,
		fromCalls
	};
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

		it('uses is.null for nullable filters', async () => {
			const row = { id: 'p-1', archived_at: null, organization_id: 'org-1' };
			const { builder, calls } = createMockQueryBuilder(row);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findOne('personnel', 'org-1', { id: 'p-1', archived_at: null });

			expect(calls).toContainEqual({ method: 'eq', args: ['id', 'p-1'] });
			expect(calls).toContainEqual({ method: 'is', args: ['archived_at', null] });
			expect(calls).not.toContainEqual({ method: 'eq', args: ['archived_at', null] });
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

		it('uses org_id scoping for audit_logs', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('audit_logs', 'org-1');

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
			expect(eqCalls).not.toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
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

		it('uses is.null for nullable findMany filters', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('records', 'org-1', { archived_at: null }, { filters: { deleted_at: null } });

			expect(calls).toContainEqual({ method: 'is', args: ['archived_at', null] });
			expect(calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
			expect(calls).not.toContainEqual({ method: 'eq', args: ['archived_at', null] });
			expect(calls).not.toContainEqual({ method: 'eq', args: ['deleted_at', null] });
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

		it('applies notInFilters using .not()', async () => {
			const { builder, calls } = createMockQueryBuilder([]);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.findMany('records', 'org-1', undefined, {
				notInFilters: { action: ['auth.login_success', 'security.rate_limit_violation'] }
			});

			const notCalls = calls.filter((c) => c.method === 'not');
			expect(notCalls).toContainEqual({
				method: 'not',
				args: ['action', 'in', '(auth.login_success,security.rate_limit_violation)']
			});
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

		it('pages through results when a table has more than 1000 rows', async () => {
			const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index + 1}` }));
			const secondPage = [{ id: 'row-1001' }, { id: 'row-1002' }];
			const { supabase, calls, fromCalls } = createPagedMockSupabase([{ data: firstPage }, { data: secondPage }]);
			const store = createSupabaseDataStore(supabase);

			const result = await store.findMany('personnel_trainings', 'org-1');

			expect(result).toHaveLength(1002);
			expect(result[0]).toEqual({ id: 'row-1' });
			expect(result[1001]).toEqual({ id: 'row-1002' });
			expect(fromCalls).toHaveBeenCalledTimes(2);
			const rangeCalls = calls.filter((c) => c.method === 'range');
			expect(rangeCalls).toEqual([
				{ method: 'range', args: [0, 999] },
				{ method: 'range', args: [1000, 1999] }
			]);
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

		it('inserts audit logs with org_id', async () => {
			const row = { id: 'log-1', action: 'personnel.create', org_id: 'org-1' };
			const { builder, calls } = createMockQueryBuilder(row);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.insert('audit_logs', 'org-1', {
				id: 'log-1',
				action: 'personnel.create'
			});

			expect(result).toEqual(row);

			const insertCalls = calls.filter((c) => c.method === 'insert');
			expect(insertCalls[0].args[0]).toEqual({
				id: 'log-1',
				action: 'personnel.create',
				org_id: 'org-1'
			});
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

		it('uses is.null for nullable deleteWhere filters', async () => {
			const { builder, calls } = createMockQueryBuilder(null);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.deleteWhere('records', 'org-1', { archived_at: null });

			expect(calls).toContainEqual({ method: 'is', args: ['archived_at', null] });
			expect(calls).not.toContainEqual({ method: 'eq', args: ['archived_at', null] });
		});
	});

	describe('deleteWhereAny', () => {
		it('deletes with org scoping and exact OR filter groups', async () => {
			const { builder, calls } = createMockQueryBuilder(null);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.deleteWhereAny('daily_assignments', 'org-1', [
				{ date: '2026-04-10', assignment_type_id: 'type-a' },
				{ date: '2026-04-11', assignment_type_id: 'type-b' }
			]);

			const deleteCalls = calls.filter((c) => c.method === 'delete');
			expect(deleteCalls).toHaveLength(1);

			const eqCalls = calls.filter((c) => c.method === 'eq');
			expect(eqCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
			expect(calls).toContainEqual({
				method: 'or',
				args: [
					'and(date.eq.2026-04-10,assignment_type_id.eq.type-a),and(date.eq.2026-04-11,assignment_type_id.eq.type-b)'
				]
			});
		});

		it('does not issue a query for empty filter groups', async () => {
			const { builder } = createMockQueryBuilder(null);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			await store.deleteWhereAny('daily_assignments', 'org-1', []);

			expect(supabase.from as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
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

	describe('upsertMany', () => {
		it('upserts multiple rows with conflict columns and default select', async () => {
			const rows = [
				{
					id: 'pt-1',
					personnel_id: 'p-1',
					training_type_id: 'tt-1',
					organization_id: 'org-1'
				}
			];
			const { builder, calls } = createMockQueryBuilder(rows);
			const supabase = createMockSupabase(builder);
			const store = createSupabaseDataStore(supabase);

			const result = await store.upsertMany(
				'personnel_trainings',
				'org-1',
				[{ personnel_id: 'p-1', training_type_id: 'tt-1' }],
				{ onConflict: 'organization_id,personnel_id,training_type_id' }
			);

			expect(result).toEqual(rows);

			const upsertCalls = calls.filter((c) => c.method === 'upsert');
			expect(upsertCalls[0].args).toEqual([
				[{ personnel_id: 'p-1', training_type_id: 'tt-1', organization_id: 'org-1' }],
				{ onConflict: 'organization_id,personnel_id,training_type_id' }
			]);

			const selectCalls = calls.filter((c) => c.method === 'select');
			expect(selectCalls[0]).toEqual({ method: 'select', args: ['*'] });
		});
	});

	describe('listDistinctAuditActions', () => {
		it('uses the audit-log action distinct RPC with excluded actions', async () => {
			const supabase = createMockSupabaseWithRpc([
				{ action: 'training.update' },
				{ action: 'personnel.create' },
				{ action: 'personnel.create' }
			]);
			const store = createSupabaseDataStore(supabase);

			const result = await store.listDistinctAuditActions('org-1', ['auth.login_success']);

			expect(result).toEqual(['personnel.create', 'training.update']);
			expect(supabase.rpc).toHaveBeenCalledWith('list_audit_log_actions', {
				p_org_id: 'org-1',
				p_excluded_actions: ['auth.login_success']
			});
			expect(supabase.from as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
		});
	});
});
