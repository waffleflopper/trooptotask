import { describe, expect, it } from 'vitest';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { createQueryWithRawStorePortsContext } from './trainingPersistence.test-support.server';
import { fetchTrainingWorkspaceData } from './trainingWorkspaceQuery.server';

const ORG = 'test-org';

async function loadGroupChoices(scopeSet: ScopeSet) {
	const ctx = createQueryWithRawStorePortsContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet,
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'view',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	ctx.rawStore.seed('groups', [
		{ id: 'alpha', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'bravo', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
	ctx.rawStore.seed('user_pinned_groups', [
		{ id: 'pin-bravo', organization_id: ORG, user_id: 'test-user', group_name: 'Bravo', sort_order: 0 },
		{ id: 'pin-alpha', organization_id: ORG, user_id: 'test-user', group_name: 'Alpha', sort_order: 1 }
	]);
	const workspace = fetchTrainingWorkspaceData(ctx, ORG);
	await Promise.allSettled(Object.values(workspace));
	return { groups: await workspace.groups, pinnedGroups: await workspace.pinnedGroups };
}

describe('fetchTrainingWorkspaceData', () => {
	it('returns only the Groups and pinned names in a Group-scoped viewer’s scope', async () => {
		await expect(loadGroupChoices({ kind: 'groups', groupIds: ['alpha'] })).resolves.toEqual({
			groups: [{ id: 'alpha', name: 'Alpha', sortOrder: 0 }],
			pinnedGroups: ['Alpha']
		});
	});

	it('returns no Groups or pinned names to an empty Group scope', async () => {
		await expect(loadGroupChoices({ kind: 'groups', groupIds: [] })).resolves.toEqual({
			groups: [],
			pinnedGroups: []
		});
	});

	it('keeps the full catalog and pins for an Organization-scoped Training-only viewer', async () => {
		const { groups, pinnedGroups } = await loadGroupChoices({ kind: 'organization' });

		expect(groups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		expect(pinnedGroups).toEqual(['Bravo', 'Alpha']);
	});
});
