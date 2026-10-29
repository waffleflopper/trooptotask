import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect } from 'vitest';
import { personnelProvider } from './test-support/personnelProvider';
import { createSupabaseGroupPersistence } from './groupPersistence.server';
const ORGANIZATION = { kind: 'organization' } as const;
describe('ordinary Group persistence', () => {
	it('reads the catalog by display position, name and id', async () => {
		const { client } = personnelProvider({
			groups: [
				{ id: 'a', name: 'Zulu', sort_order: 0, organization_id: 'org-a' },
				{ id: 'c', name: 'Alpha', sort_order: 0, organization_id: 'org-a' },
				{ id: 'b', name: 'Alpha', sort_order: 0, organization_id: 'org-a' },
				{ id: 'd', name: 'Earlier', sort_order: -1, organization_id: 'org-a' }
			]
		});
		const port = createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION);
		expect((await port.listCatalog()).map((group) => group.id)).toEqual(['d', 'b', 'c', 'a']);
	});
	it('pages tied catalogs completely while limiting references to the captured Organization', async () => {
		const ids = Array.from({ length: 1001 }, (_, i) => `group-${String(i).padStart(4, '0')}`);
		const { client, state } = personnelProvider({
			groups: [
				...ids.map((id) => ({ id, name: id, sort_order: 0, organization_id: 'org-a' })),
				{ id: 'foreign', name: 'Foreign', sort_order: 0, organization_id: 'org-b' }
			]
		});
		state.unstablePages = true;
		const port = createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION);
		expect((await port.listCatalog()).map((group) => group.id)).toEqual(ids);
		expect(await port.findReference('foreign')).toBeNull();
		const before = state.requests.length;
		expect(await port.findNamesByIds([])).toEqual(new Map());
		expect(state.requests).toHaveLength(before);
	});
	it("reads only the Groups in a Group-scoped actor's scope", async () => {
		const { client, state } = personnelProvider({
			groups: [
				{ id: 'alpha', name: 'Alpha', sort_order: 0, organization_id: 'org-a' },
				{ id: 'bravo', name: 'Bravo', sort_order: 1, organization_id: 'org-a' },
				{ id: 'foreign', name: 'Foreign', sort_order: 0, organization_id: 'org-b' }
			]
		});
		const port = createSupabaseGroupPersistence(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: ['alpha', 'foreign'] })
		);
		expect(await port.listCatalog()).toEqual([
			{ id: 'alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }
		]);
		expect(await port.findReference('bravo')).toBeNull();
		expect(await port.findReference('alpha')).toEqual({ id: 'alpha' });
		expect(await port.findNamesByIds(['alpha', 'bravo'])).toEqual(new Map([['alpha', 'Alpha']]));
		const empty = createSupabaseGroupPersistence(
			client,
			'org-a',
			groupCoverageForTest({ kind: 'groups', groupIds: [] })
		);
		const before = state.requests.length;
		expect([await empty.listCatalog(), await empty.findReference('alpha')]).toEqual([[], null]);
		expect(state.requests).toHaveLength(before);
	});
	it('omits unknown names and never deletes foreign rows', async () => {
		const { client, state } = personnelProvider({
			groups: [
				{ id: 'unknown', name: null, organization_id: 'org-a' },
				{ id: 'foreign', name: 'Foreign', sort_order: 0, organization_id: 'org-b' }
			]
		});
		const port = createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION);
		const created = await port.create({ name: 'Alpha' });
		expect(created).toMatchObject({ name: 'Alpha', sortOrder: 0 });
		expect(await port.findNamesByIds([created.id, 'unknown', 'foreign'])).toEqual(new Map([[created.id, 'Alpha']]));
		expect(state.rows.groups.find((row) => row.id === 'foreign')?.name).toBe('Foreign');
	});
	it('propagates later-page and mutation failure without publishing partial success', async () => {
		const { client, state } = personnelProvider({
			groups: Array.from({ length: 1001 }, (_, i) => ({
				id: `group-${i}`,
				name: 'Group',
				sort_order: 0,
				organization_id: 'org-a'
			}))
		});
		const port = createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION);
		state.failure = (op) =>
			op.offset === 1000 || op.method === 'POST' ? { code: '42501', message: 'Groups unavailable', status: 403 } : null;
		await expect(port.listCatalog()).rejects.toThrow('Groups unavailable');
		await expect(port.create({ name: 'New' })).rejects.toThrow('Groups unavailable');
		expect(state.rows.groups).toHaveLength(1001);
	});
	it('turns a duplicate-name constraint into a public 409', async () => {
		const { client, state } = personnelProvider({
			groups: [{ id: 'alpha', name: 'Alpha', sort_order: 0, organization_id: 'org-a' }]
		});
		const port = createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION);
		state.failure = () => ({
			code: '23505',
			message: 'duplicate key value violates unique constraint "groups_sibling_name_key"',
			status: 409
		});
		await expect(port.create({ name: 'Alpha' })).rejects.toMatchObject({
			status: 409,
			message: 'A Group with that name already exists.'
		});
		expect(state.rows.groups).toEqual([{ id: 'alpha', name: 'Alpha', sort_order: 0, organization_id: 'org-a' }]);
	});
	it('returns a client error when the database rejects a new Group name', async () => {
		const { client, state } = personnelProvider();
		state.failure = () => ({ code: '22023', message: 'Group names cannot contain the path separator', status: 400 });
		const port = createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION);
		await expect(port.create({ name: 'HQ / Supply' })).rejects.toMatchObject({
			name: 'RequestFailure',
			status: 400
		});
		expect(state.rows.groups).toEqual([]);
	});
});

function groupRpc(reply: () => Response | Promise<Response>) {
	const calls: Array<{ path: string; body: unknown }> = [];
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				calls.push({ path: new URL(request.url).pathname, body: await request.json() });
				return reply();
			}
		}
	});
	return { calls, port: createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION) };
}

describe('Group editor commands', () => {
	it('renames, reorders and deletes through one call each, bound to the Organization', async () => {
		const rename = groupRpc(() =>
			Response.json([{ id: 'alpha', name: 'Weapons', sort_order: 2, parent_id: null, depth: 1 as const }])
		);
		await expect(rename.port.rename('alpha', 'Weapons')).resolves.toEqual({
			id: 'alpha',
			name: 'Weapons',
			sortOrder: 2,
			parentId: null,
			depth: 1 as const
		});
		const order = groupRpc(() => new Response(null, { status: 204 }));
		await expect(order.port.setOrder(['bravo', 'alpha'], ['alpha', 'bravo'])).resolves.toBeUndefined();
		const remove = groupRpc(() => Response.json(3));
		await expect(remove.port.deleteWithReassignment('alpha', null)).resolves.toBe(3);
		expect([...rename.calls, ...order.calls, ...remove.calls]).toEqual([
			{
				path: '/rest/v1/rpc/rename_group',
				body: { p_organization_id: 'org-a', p_group_id: 'alpha', p_name: 'Weapons' }
			},
			{
				path: '/rest/v1/rpc/set_group_order',
				body: { p_organization_id: 'org-a', p_group_ids: ['bravo', 'alpha'], p_expected_group_ids: ['alpha', 'bravo'] }
			},
			{
				path: '/rest/v1/rpc/delete_group_with_reassignment',
				body: { p_organization_id: 'org-a', p_group_id: 'alpha', p_target_group_id: null }
			}
		]);
	});

	it.each([
		['42501', 403],
		['P0002', 404],
		['22023', 400],
		['22P02', 400],
		['GRP01', 409],
		['40P01', 409],
		['40001', 409],
		['55P03', 409],
		['23505', 409]
	])('answers a rolled back %s as a %i without forwarding the database message', async (code, status) => {
		const { port } = groupRpc(() =>
			Response.json({ code, message: 'synthetic database message', details: null, hint: null }, { status: 500 })
		);
		for (const command of [
			() => port.rename('alpha', 'Weapons'),
			() => port.setOrder(['alpha'], ['alpha']),
			() => port.deleteWithReassignment('alpha', 'bravo')
		]) {
			const failure = await command().then(
				() => undefined,
				(error: unknown) => error
			);
			expect(failure).toMatchObject({ name: 'RequestFailure', status });
			expect((failure as Error).message).not.toContain('synthetic database message');
		}
	});

	it('says a lost reply is unconfirmed and treats a rename of a vanished Group as 404', async () => {
		const lost = groupRpc(() => Promise.reject(new TypeError('fetch failed')));
		for (const command of [
			() => lost.port.rename('alpha', 'Weapons'),
			() => lost.port.setOrder(['alpha'], ['alpha']),
			() => lost.port.deleteWithReassignment('alpha', null)
		]) {
			await expect(command()).rejects.toMatchObject({
				status: 503,
				message: "We couldn't confirm the Group change. Reload to see what saved.",
				publicMessage: true
			});
		}
		const vanished = groupRpc(() => Response.json([]));
		await expect(vanished.port.rename('alpha', 'Weapons')).rejects.toMatchObject({
			status: 404,
			message: 'That Group is no longer available.'
		});
	});
});
