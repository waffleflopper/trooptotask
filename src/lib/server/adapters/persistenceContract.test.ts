import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createScopedDataStore } from './scopedDataStore';
import { createSupabaseDataStore } from './supabaseDataStore';

type Row = { id: string; [column: string]: unknown };

function provider(table: string, rows: Row[], failPage = false) {
	let saved = structuredClone(rows);
	let upsertConflict: string | null = null;
	const client = createClient('http://persistence.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://persistence.invalid' || url.pathname !== `/rest/v1/${table}`) {
					throw new Error('Unexpected provider target');
				}
				const matches = (row: Row) =>
					[...url.searchParams].every(([column, filter]) => {
						if (['select', 'offset', 'limit', 'order', 'on_conflict'].includes(column)) return true;
						if (filter.startsWith('eq.')) return String(row[column]) === filter.slice(3);
						if (filter.startsWith('is.')) return row[column] === null && filter === 'is.null';
						if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[column]));
						if (filter.startsWith('cd.{')) {
							const groups = filter.slice(4, -1).split(',');
							return Array.isArray(row[column]) && row[column].every((id) => groups.includes(String(id)));
						}
						if (filter === 'not.eq.{}') return Array.isArray(row[column]) && row[column].length > 0;
						throw new Error(`Unsupported finite provider predicate ${column}`);
					});
				let result: Row[];
				if (request.method === 'POST') {
					if (request.headers.get('prefer')?.includes('resolution=merge-duplicates')) {
						upsertConflict = url.searchParams.get('on_conflict');
					}
					const body: Row | Row[] = await request.json();
					result = Array.isArray(body) ? body : [body];
					for (const row of result) {
						const index = saved.findIndex((current) => current.id === row.id);
						if (request.headers.get('prefer')?.includes('resolution=merge-duplicates') && index >= 0) {
							saved[index] = row;
						} else saved.push(row);
					}
				} else {
					result = saved.filter(matches);
					if (request.method === 'DELETE') saved = saved.filter((row) => !matches(row));
					else if (request.method !== 'GET') throw new Error('Unsupported finite provider method');
				}
				const count = result.length;
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (failPage && offset > 0) {
					return Response.json({ message: 'Later provider page unavailable' }, { status: 400 });
				}
				result = result.slice(offset, offset + Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000));
				if (request.headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
					return result.length === 1
						? Response.json(result[0])
						: Response.json({ code: 'PGRST116', message: 'No matching row' }, { status: 406 });
				}
				return Response.json(result, {
					headers: { 'Content-Range': `${offset}-${offset + result.length - 1}/${count}` }
				});
			}
		}
	});
	return {
		store: createSupabaseDataStore(client),
		saved: () => structuredClone(saved),
		upsertConflict: () => upsertConflict
	};
}

describe('Request persistence contracts through the real provider SDK', () => {
	it.each([
		['personnel', 'organization_id'],
		['audit_logs', 'org_id'],
		['data_exports', 'org_id'],
		['dashboard_configs', 'org_id']
	])('keeps %s reads, inserts and deletions in the admitted Organization', async (table, column) => {
		const run = provider(table, [
			{ id: 'own', [column]: 'org-a', title: 'Retained A' },
			{ id: 'foreign', [column]: 'org-b', title: 'Retained B' }
		]);
		expect(await run.store.findMany(table, 'org-a')).toEqual([{ id: 'own', [column]: 'org-a', title: 'Retained A' }]);
		expect(await run.store.findOne(table, 'org-a', { id: 'foreign' })).toBeNull();
		await run.store.insert(table, 'org-a', { id: 'new', [column]: 'org-b', title: 'New A' });
		expect(run.saved()).toContainEqual({ id: 'new', [column]: 'org-a', title: 'New A' });
		expect(await run.store.deleteManyByIds(table, 'org-a', ['own', 'foreign'])).toBe(1);
		expect(run.saved()).toEqual([
			{ id: 'foreign', [column]: 'org-b', title: 'Retained B' },
			{ id: 'new', [column]: 'org-a', title: 'New A' }
		]);
	});

	it('binds Organization rows to their primary key', async () => {
		const run = provider('organizations', [
			{ id: 'org-a', name: 'A' },
			{ id: 'org-b', name: 'B' }
		]);
		expect(await run.store.findMany('organizations', 'org-a')).toEqual([{ id: 'org-a', name: 'A' }]);
		expect(await run.store.findOne('organizations', 'org-a', { id: 'org-b' })).toBeNull();
	});

	it('overrides submitted Organization IDs in insert and upsert batches', async () => {
		const run = provider('personnel', [{ id: 'foreign', organization_id: 'org-b', title: 'Keep B' }]);
		await run.store.insertMany('personnel', 'org-a', [
			{ id: 'first', organization_id: 'org-b', title: 'First A' },
			{ id: 'second', title: 'Second A' }
		]);
		await run.store.upsertMany('personnel', 'org-a', [{ id: 'first', organization_id: 'org-b', title: 'Updated A' }], {
			onConflict: 'organization_id,id'
		});
		expect(run.upsertConflict()).toBe('organization_id,id');
		expect(run.saved()).toEqual([
			{ id: 'foreign', organization_id: 'org-b', title: 'Keep B' },
			{ id: 'first', organization_id: 'org-a', title: 'Updated A' },
			{ id: 'second', organization_id: 'org-a', title: 'Second A' }
		]);
	});

	it('filters Personnel before taking a counted page', async () => {
		const run = provider('personnel', [
			{ id: 'bravo', organization_id: 'org-a', group_id: 'bravo' },
			{ id: 'alpha-1', organization_id: 'org-a', group_id: 'alpha' },
			{ id: 'unassigned', organization_id: 'org-a', group_id: null },
			{ id: 'alpha-2', organization_id: 'org-a', group_id: 'alpha' },
			{ id: 'foreign', organization_id: 'org-b', group_id: 'alpha' }
		]);
		const rules = new Map([['personnel', { type: 'group' as const, groupColumn: 'group_id' }]]);
		const scoped = createScopedDataStore(run.store, { kind: 'groups', groupIds: ['alpha'] }, rules);
		expect(await scoped.findManyWithCount('personnel', 'org-a', undefined, { range: { from: 1, to: 1 } })).toEqual({
			data: [{ id: 'alpha-2', organization_id: 'org-a', group_id: 'alpha' }],
			count: 2
		});
		expect(await scoped.findOne('personnel', 'org-a', { id: 'unassigned' })).toBeNull();
		expect(await scoped.findOne('personnel', 'org-a', { id: 'foreign' })).toBeNull();
		const empty = createScopedDataStore(run.store, { kind: 'groups', groupIds: [] }, rules);
		expect(await empty.findManyWithCount('personnel', 'org-a')).toEqual({ data: [], count: 0 });
	});

	it('admits only nonempty saved roster scopes wholly inside the Group grant', async () => {
		const run = provider('sign_in_rosters', [
			{ id: 'alpha', organization_id: 'org-a', scope_group_ids: ['alpha'] },
			{ id: 'mixed', organization_id: 'org-a', scope_group_ids: ['alpha', 'bravo'] },
			{ id: 'unassigned', organization_id: 'org-a', scope_group_ids: [] },
			{ id: 'foreign', organization_id: 'org-b', scope_group_ids: ['alpha'] }
		]);
		const rules = new Map([
			['sign_in_rosters', { type: 'group-array' as const, groupColumn: 'scope_group_ids', requireNonEmpty: true }]
		]);
		const scoped = createScopedDataStore(run.store, { kind: 'groups', groupIds: ['alpha'] }, rules);
		expect(await scoped.findMany('sign_in_rosters', 'org-a')).toEqual([
			{ id: 'alpha', organization_id: 'org-a', scope_group_ids: ['alpha'] }
		]);
		expect(await scoped.findOne('sign_in_rosters', 'org-a', { id: 'mixed' })).toBeNull();
	});

	it('returns complete provider-sized history and its count', async () => {
		const run = provider(
			'personnel',
			Array.from({ length: 1001 }, (_, index) => ({ id: `person-${index}`, organization_id: 'org-a' }))
		);
		const result = await run.store.findManyWithCount<Row>('personnel', 'org-a');
		expect(result.count).toBe(1001);
		expect(result.data).toHaveLength(1001);
		expect(result.data[1000]).toEqual({ id: 'person-1000', organization_id: 'org-a' });
	});

	it.each(['findMany', 'findManyWithCount'] as const)(
		'rejects a later %s failure instead of returning partial data',
		async (read) => {
			const run = provider(
				'personnel',
				Array.from({ length: 1001 }, (_, index) => ({ id: `person-${index}`, organization_id: 'org-a' })),
				true
			);
			await expect(run.store[read]('personnel', 'org-a')).rejects.toThrow('Later provider page unavailable');
		}
	);
});
