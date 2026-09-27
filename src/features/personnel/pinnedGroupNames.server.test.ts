import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { listPinnedGroupNames } from './pinnedGroupNames.server';

describe('listPinnedGroupNames', () => {
	it('returns only the current user and Organization pins in saved order', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1', userId: 'user-1' } });
		ctx.store.seed('user_pinned_groups', [
			{ id: 'later', organization_id: 'org-1', user_id: 'user-1', group_name: 'Bravo', sort_order: 2 },
			{ id: 'earlier', organization_id: 'org-1', user_id: 'user-1', group_name: 'Alpha', sort_order: 1 },
			{ id: 'other-user', organization_id: 'org-1', user_id: 'user-2', group_name: 'Other user', sort_order: 0 },
			{ id: 'other-org', organization_id: 'org-2', user_id: 'user-1', group_name: 'Other org', sort_order: 0 }
		]);

		expect(await listPinnedGroupNames(ctx)).toEqual(['Alpha', 'Bravo']);
	});
});
