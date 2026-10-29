import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from './criticalTasksPersistence.test-support.server';
import { fetchCriticalTasksBootstrap } from './criticalTasksWorkspaceQuery.server';

describe('criticalTasksWorkspaceQuery', () => {
	it('loads the workspace with no pins when the pinned Groups read fails', async () => {
		const ctx = createTestContext();
		ctx.store.seed('groups', [{ id: 'group-alpha', organization_id: 'test-org', name: 'Alpha', sort_order: 0 }]);
		const requestFindMany = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = ((table, orgId, filters, options) =>
			table === 'user_pinned_groups'
				? Promise.reject(new Error('Pinned Groups read failed'))
				: requestFindMany(table, orgId, filters, options)) as typeof ctx.store.findMany;
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const bootstrap = await fetchCriticalTasksBootstrap(ctx);

		await expect(bootstrap.groups).resolves.toEqual([
			{ id: 'group-alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }
		]);
		await expect(bootstrap.pinnedGroups).resolves.toEqual([]);
	});

	it('returns settings immediately while leaving workspace lists promise-backed', async () => {
		const ctx = createTestContext({
			auth: {
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }),
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'view',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('organizations', [
			{
				id: 'test-org',
				critical_tasks_default_expiration_months: 18,
				critical_tasks_expiring_soon_warning_days: 45
			}
		]);
		ctx.store.seed('groups', [
			{
				id: 'group-alpha',
				organization_id: 'test-org',
				name: 'Alpha',
				sort_order: 0
			},
			{ id: 'group-bravo', organization_id: 'test-org', name: 'Bravo', sort_order: 1 },
			{ id: 'foreign', organization_id: 'other-org', name: 'Foreign', sort_order: -1 }
		]);
		ctx.store.seed('user_pinned_groups', [
			{ id: 'pin-bravo', organization_id: 'test-org', user_id: 'test-user', group_id: 'group-bravo', sort_order: 0 },
			{ id: 'pin-alpha', organization_id: 'test-org', user_id: 'test-user', group_id: 'group-alpha', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Jane',
				last_name: 'Smith',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				groups: { name: 'Alpha' },
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-1',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T12:00:00Z'
			},
			{
				id: 'task-archived',
				organization_id: 'test-org',
				task_code: '181-105-9999',
				title: 'Archived casualty care task',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: '2026-04-03T12:00:00Z',
				created_at: '2026-04-01T12:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: 'test-org',
				personnel_id: 'person-1',
				ict_task_id: 'task-1',
				completed_at: '2026-04-02',
				validation_method: 'Practical Exercise',
				validated_by: 'SFC Jones',
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-04-02T12:00:00Z'
			}
		]);
		const requestFindMany = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = ((table, orgId, filters, options) =>
			table === 'personnel'
				? Promise.reject(new Error('Personnel SELECT denied for this Critical Tasks-only actor'))
				: requestFindMany(table, orgId, filters, options)) as typeof ctx.store.findMany;

		const bootstrap = await fetchCriticalTasksBootstrap(ctx);

		expect(bootstrap.settings).toEqual({
			defaultExpirationMonths: 18,
			expiringSoonWarningDays: 45
		});
		expect(bootstrap.personnel).toBeInstanceOf(Promise);
		expect(bootstrap.groups).toBeInstanceOf(Promise);
		expect(bootstrap.pinnedGroups).toBeInstanceOf(Promise);
		expect(bootstrap.ictTasks).toBeInstanceOf(Promise);
		expect(bootstrap.personnelIctCompletions).toBeInstanceOf(Promise);
		await expect(bootstrap.personnel).resolves.toEqual([
			expect.objectContaining({
				id: 'person-1',
				firstName: 'Jane',
				lastName: 'Smith',
				groupName: 'Alpha'
			})
		]);
		await expect(bootstrap.groups).resolves.toEqual([
			{ id: 'group-alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }
		]);
		await expect(bootstrap.pinnedGroups).resolves.toEqual([]);
		await expect(bootstrap.ictTasks).resolves.toEqual([
			expect.objectContaining({
				id: 'task-1',
				taskCode: '181-105-1001'
			})
		]);
		const libraryBootstrap = await fetchCriticalTasksBootstrap(ctx, { includeArchivedTasks: true });
		await expect(libraryBootstrap.ictTasks).resolves.toEqual([
			expect.objectContaining({
				id: 'task-1',
				taskCode: '181-105-1001'
			}),
			expect.objectContaining({
				id: 'task-archived',
				taskCode: '181-105-9999',
				archivedAt: '2026-04-03T12:00:00Z'
			})
		]);
		await expect(bootstrap.personnelIctCompletions).resolves.toEqual([
			expect.objectContaining({
				id: 'completion-1',
				personnelId: 'person-1',
				ictTaskId: 'task-1'
			})
		]);
	});
});
