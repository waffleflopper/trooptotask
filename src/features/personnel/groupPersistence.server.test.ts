import { describe, it, expect } from 'vitest';
import { personnelProvider } from './test-support/personnelProvider';
import { createSupabaseGroupPersistence } from './groupPersistence.server';
const ORGANIZATION = { kind: 'organization' } as const;
describe('ordinary Group persistence', () => {
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
		const port = createSupabaseGroupPersistence(client, 'org-a', { kind: 'groups', groupIds: ['alpha', 'foreign'] });
		expect(await port.listCatalog()).toEqual([{ id: 'alpha', name: 'Alpha', sortOrder: 0 }]);
		expect(await port.findReference('bravo')).toBeNull();
		expect(await port.findReference('alpha')).toEqual({ id: 'alpha' });
		expect(await port.findNamesByIds(['alpha', 'bravo'])).toEqual(new Map([['alpha', 'Alpha']]));
		const empty = createSupabaseGroupPersistence(client, 'org-a', { kind: 'groups', groupIds: [] });
		const before = state.requests.length;
		expect([await empty.listCatalog(), await empty.findReference('alpha')]).toEqual([[], null]);
		expect(state.requests).toHaveLength(before);
	});
	it('omits unknown names and preserves saved identity/order while never changing foreign rows', async () => {
		const { client, state } = personnelProvider({
			groups: [
				{ id: 'unknown', name: null, organization_id: 'org-a' },
				{ id: 'foreign', name: 'Foreign', sort_order: 0, organization_id: 'org-b' }
			]
		});
		const port = createSupabaseGroupPersistence(client, 'org-a', ORGANIZATION);
		const created = await port.create({ name: 'Alpha' });
		expect(created).toMatchObject({ name: 'Alpha', sortOrder: 0 });
		expect(await port.update(created.id, { name: 'Renamed' })).toEqual({ ...created, name: 'Renamed' });
		expect(await port.findNamesByIds([created.id, 'unknown', 'foreign'])).toEqual(new Map([[created.id, 'Renamed']]));
		await port.delete('foreign');
		expect(state.rows.groups.find((row) => row.id === 'foreign')?.name).toBe('Foreign');
		await port.delete(created.id);
		expect(state.rows.groups.some((row) => row.id === created.id)).toBe(false);
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
});
