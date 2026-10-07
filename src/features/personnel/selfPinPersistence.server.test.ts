import { describe, it, expect } from 'vitest';
import { personnelProvider } from './test-support/personnelProvider';
import { createSupabaseSelfPinPersistence } from './selfPinPersistence.server';
import { replacePinnedGroups } from './pinnedGroupOperations.server';
describe('ordinary self pins', () => {
	it('returns all own names in stable saved order with other users and Organizations concealed', async () => {
		const names = Array.from({ length: 1001 }, (_, i) => `Group ${String(i).padStart(4, '0')}`);
		const { client, state } = personnelProvider({
			user_pinned_groups: [
				...names.map((group_name, i) => ({
					id: `pin-${String(i).padStart(4, '0')}`,
					organization_id: 'org-a',
					user_id: 'user-a',
					group_name,
					sort_order: 0
				})),
				{ id: 'other-user', organization_id: 'org-a', user_id: 'user-b', group_name: 'Other', sort_order: 0 },
				{ id: 'foreign', organization_id: 'org-b', user_id: 'user-a', group_name: 'Foreign', sort_order: 0 }
			]
		});
		state.unstablePages = true;
		expect(await createSupabaseSelfPinPersistence(client, 'org-a', 'user-a').listNames()).toEqual(names);
	});
	it('inserts defaults, removes only the captured own name and replaces in supplied order', async () => {
		const other = { id: 'other', organization_id: 'org-a', user_id: 'user-b', group_name: 'Alpha', sort_order: 0 };
		const foreign = { ...other, id: 'foreign', organization_id: 'org-b', user_id: 'user-a' };
		const { client, state } = personnelProvider({ user_pinned_groups: [other, foreign] });
		const port = createSupabaseSelfPinPersistence(client, 'org-a', 'user-a');
		const result = await port.insert({ groupName: 'Alpha' });
		expect(result).toMatchObject({ groupName: 'Alpha', sortOrder: 0 });
		await port.removeName('Alpha');
		expect(state.rows.user_pinned_groups).toEqual([other, foreign]);
		await port.replaceNames(['Bravo', 'Alpha']);
		expect(await port.listNames()).toEqual(['Bravo', 'Alpha']);
		expect(
			state.rows.user_pinned_groups.filter((row) => row.user_id === 'user-b' || row.organization_id === 'org-b')
		).toEqual([other, foreign]);
		await port.replaceNames([]);
		expect(state.rows.user_pinned_groups).toEqual([other, foreign]);
	});
	it('retains acknowledged deletion when replacement insert fails and records no operation success audit', async () => {
		const own = { id: 'own', organization_id: 'org-a', user_id: 'user-a', group_name: 'Alpha', sort_order: 0 };
		const other = { ...own, id: 'other', user_id: 'user-b' };
		const { client, state } = personnelProvider({ user_pinned_groups: [own, other] });
		const port = createSupabaseSelfPinPersistence(client, 'org-a', 'user-a');
		state.failure = (op) => (op.method === 'POST' ? { code: '42501', message: 'Pins unavailable', status: 403 } : null);
		const events: unknown[] = [];
		await expect(
			replacePinnedGroups({ selfPins: port, audit: { log: (event) => events.push(event) } }, ['Bravo'])
		).rejects.toThrow('Pins unavailable');
		expect(state.rows.user_pinned_groups).toEqual([other]);
		expect(events).toEqual([]);
	});
});
