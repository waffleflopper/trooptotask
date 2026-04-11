import { describe, expect, it } from 'vitest';
import { createUserWritePortsContext } from '$lib/server/adapters/inMemory';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import { loadUserOrgPreferences, patchUserOrgPreferences } from './userPreferences';

function buildContext(overrides?: Parameters<typeof createUserWritePortsContext>[0]) {
	return createUserWritePortsContext(overrides);
}

describe('user preferences', () => {
	it('returns defaults when no row exists', async () => {
		const ctx = buildContext();

		const result = await loadUserOrgPreferences(ctx);

		expect(result).toEqual(getDefaultUserOrgPreferences());
	});

	it('merges stored preferences with defaults', async () => {
		const ctx = buildContext();
		ctx.store.seed('user_org_preferences', [
			{
				id: 'pref-1',
				organization_id: 'test-org',
				user_id: 'test-user',
				preferences: {
					calendar: {
						showStatusText: true
					}
				}
			}
		]);

		const result = await loadUserOrgPreferences(ctx);

		expect(result.calendar.showStatusText).toBe(true);
		expect(result.calendar.showPersonnelRoles).toBe(true);
		expect(result.calendar.highlightOnboarding).toBe(true);
		expect(result.training.matrixViewMode).toBe('by-group');
	});

	it('creates a new row when patching for the first time', async () => {
		const ctx = buildContext();

		const result = await patchUserOrgPreferences(ctx, {
			calendar: {
				showStatusText: true,
				todaySummaryExpanded: false
			}
		});

		expect(result.calendar.showStatusText).toBe(true);
		expect(result.calendar.todaySummaryExpanded).toBe(false);

		const stored = (await ctx.store.findMany('user_org_preferences', 'test-org')) as Record<string, unknown>[];
		expect(stored).toHaveLength(1);
		expect(stored[0].user_id).toBe('test-user');
		expect((stored[0].preferences as { calendar: { showStatusText: boolean } }).calendar.showStatusText).toBe(true);
	});

	it('updates an existing row without dropping unrelated preferences', async () => {
		const ctx = buildContext();
		ctx.store.seed('user_org_preferences', [
			{
				id: 'pref-1',
				organization_id: 'test-org',
				user_id: 'test-user',
				preferences: {
					calendar: {
						showStatusText: true,
						highlightOnboarding: false,
						todaySummaryExpanded: true
					},
					training: {
						selectedGroupId: 'group-1',
						selectedViewId: null,
						matrixViewMode: 'alphabetical'
					}
				}
			}
		]);

		const result = await patchUserOrgPreferences(ctx, {
			training: {
				selectedViewId: 'view-1'
			}
		});

		expect(result.calendar.highlightOnboarding).toBe(false);
		expect(result.training.selectedGroupId).toBe('group-1');
		expect(result.training.selectedViewId).toBe('view-1');
		expect(result.training.matrixViewMode).toBe('alphabetical');
	});

	it('returns an in-memory merge for sandbox users', async () => {
		const ctx = buildContext({ auth: { userId: null } });

		const result = await patchUserOrgPreferences(ctx, {
			training: {
				selectedGroupId: 'group-1'
			}
		});

		expect(result.training.selectedGroupId).toBe('group-1');
		const stored = await ctx.store.findMany('user_org_preferences', 'test-org');
		expect(stored).toHaveLength(0);
	});
});
