import { describe, it, expect } from 'vitest';
import { personnelProvider } from './test-support/personnelProvider';
import { createSupabaseSelfPinPersistence } from './selfPinPersistence.server';
describe('ordinary self pins', () => {
	it('returns all own Group ids in stable saved order with other users and Organizations concealed', async () => {
		const groupIds = Array.from({ length: 1001 }, (_, i) => `group-${String(i).padStart(4, '0')}`);
		const { client, state } = personnelProvider({
			user_pinned_groups: [
				...groupIds.map((group_id, i) => ({
					id: `pin-${String(i).padStart(4, '0')}`,
					organization_id: 'org-a',
					user_id: 'user-a',
					group_id,
					sort_order: 0
				})),
				{ id: 'other-user', organization_id: 'org-a', user_id: 'user-b', group_id: 'other', sort_order: 0 },
				{ id: 'foreign', organization_id: 'org-b', user_id: 'user-a', group_id: 'foreign', sort_order: 0 }
			]
		});
		state.unstablePages = true;
		expect(await createSupabaseSelfPinPersistence(client, 'org-a', 'user-a').listGroupIds()).toEqual(groupIds);
	});
	it('inserts defaults and removes only the own pin for that Group', async () => {
		const other = { id: 'other', organization_id: 'org-a', user_id: 'user-b', group_id: 'group-a', sort_order: 0 };
		const foreign = { ...other, id: 'foreign', organization_id: 'org-b', user_id: 'user-a' };
		const { client, state } = personnelProvider({ user_pinned_groups: [other, foreign] });
		const port = createSupabaseSelfPinPersistence(client, 'org-a', 'user-a');
		const result = await port.insert({ groupId: 'group-a' });
		expect(result).toMatchObject({ groupId: 'group-a', sortOrder: 0 });
		expect(await port.listGroupIds()).toEqual(['group-a']);
		await port.remove('group-a');
		expect(state.rows.user_pinned_groups).toEqual([other, foreign]);
	});
});
