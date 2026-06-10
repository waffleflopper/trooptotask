import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { Group } from '$lib/stores/groups.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';
import type { CriticalTasksWorkspaceRouteData } from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import { _createCriticalTasksLayoutLoad } from './+layout.server';

describe('critical tasks layout server load', () => {
	it('registers Critical Tasks dependencies and streams the canonical workspace payload', async () => {
		const personnelIctCompletions = Promise.resolve([
			{
				id: 'ictc1',
				personnelId: 'p1',
				ictTaskId: 'task1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture',
				validatedBy: null,
				notes: null,
				loggedBy: 'user-1',
				createdAt: '2026-04-01T12:00:00Z'
			} satisfies PersonnelIctCompletion
		]);
		const criticalTasksData = {
			settings: {
				defaultExpirationMonths: 18,
				expiringSoonWarningDays: 45
			},
			personnelIctCompletions,
			ictTasks: [
				{
					id: 'task1',
					taskCode: '181-105-1001',
					title: 'Perform tactical combat casualty care',
					description: null,
					mos: ['68W'],
					expirationMonths: 12,
					sortOrder: 0,
					archivedAt: null,
					createdAt: '2026-04-01T12:00:00Z'
				} satisfies IctTask
			],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group]
		};
		const depends = vi.fn();
		const streamCriticalTasksWorkspace = vi.fn().mockResolvedValue({
			criticalTasks: {
				data: Promise.resolve({
					laneKey: 'critical-tasks',
					data: criticalTasksData,
					hydration: {
						orgId: 'org-1',
						personnel: {
							mode: 'replace',
							items: criticalTasksData.personnel,
							deferred: false,
							snapshotKey: 'personnel:1'
						},
						groups: {
							mode: 'replace',
							items: criticalTasksData.groups,
							deferred: false,
							snapshotKey: 'groups:1'
						},
						ictTasks: {
							mode: 'replace',
							items: criticalTasksData.ictTasks,
							deferred: false,
							snapshotKey: 'ict-tasks:1'
						},
						personnelIctCompletions: {
							mode: 'replace',
							items: personnelIctCompletions,
							deferred: true,
							snapshotKey: 'personnel-ict-completions:1'
						}
					}
				})
			}
		} satisfies CriticalTasksWorkspaceRouteData);
		const load = _createCriticalTasksLayoutLoad({
			streamCriticalTasksWorkspace
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;
		const parent = vi.fn().mockResolvedValue(createReadyAppShellRouteData({ orgId: 'org-1' }));

		const result = await load({
			params: { orgId: '1-11-bde' },
			locals,
			cookies,
			url: new URL('https://example.test/org/1-11-bde/critical-tasks'),
			depends,
			parent
		} as unknown as Parameters<typeof load>[0]);
		if (!result) {
			throw new Error('Expected critical tasks layout load to return data');
		}

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:critical-tasks-data');
		expect(parent).toHaveBeenCalledTimes(1);
		expect(streamCriticalTasksWorkspace).toHaveBeenCalledWith({
			locals,
			cookies,
			orgId: 'org-1',
			includeArchivedTasks: false
		});
		expect(result).not.toHaveProperty('criticalTasksSettings');
		expect(result.criticalTasks.data).toBeInstanceOf(Promise);

		await expect(result.criticalTasks.data).resolves.toMatchObject({
			laneKey: 'critical-tasks',
			data: criticalTasksData,
			hydration: {
				orgId: 'org-1',
				ictTasks: expect.objectContaining({
					mode: 'replace',
					items: criticalTasksData.ictTasks,
					deferred: false,
					snapshotKey: expect.any(String)
				}),
				personnelIctCompletions: expect.objectContaining({
					mode: 'replace',
					items: personnelIctCompletions,
					deferred: true,
					snapshotKey: expect.any(String)
				})
			}
		});
	});

	it('preserves rejected streamed Critical Tasks data for the client error boundary', async () => {
		const depends = vi.fn();
		const rejection = new Error('policy denied');
		const streamCriticalTasksWorkspace = vi.fn().mockResolvedValue({
			criticalTasks: {
				data: Promise.reject(rejection)
			}
		} satisfies CriticalTasksWorkspaceRouteData);
		const load = _createCriticalTasksLayoutLoad({
			streamCriticalTasksWorkspace
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;
		const parent = vi.fn().mockResolvedValue(createReadyAppShellRouteData({ orgId: 'org-1' }));

		const result = await load({
			params: { orgId: '1-11-bde' },
			locals,
			cookies,
			url: new URL('https://example.test/org/1-11-bde/critical-tasks'),
			depends,
			parent
		} as unknown as Parameters<typeof load>[0]);
		if (!result) {
			throw new Error('Expected critical tasks layout load to return data');
		}

		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:critical-tasks-data');
		expect(streamCriticalTasksWorkspace).toHaveBeenCalledWith({
			locals,
			cookies,
			orgId: 'org-1',
			includeArchivedTasks: false
		});
		await expect(result.criticalTasks.data).rejects.toThrow('policy denied');
	});

	it('requests archived ICT task definitions for the library child route', async () => {
		const depends = vi.fn();
		const streamCriticalTasksWorkspace = vi.fn().mockResolvedValue({
			criticalTasks: {
				data: Promise.resolve({ laneKey: 'critical-tasks' })
			}
		} as unknown as CriticalTasksWorkspaceRouteData);
		const load = _createCriticalTasksLayoutLoad({
			streamCriticalTasksWorkspace
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;
		const parent = vi.fn().mockResolvedValue(createReadyAppShellRouteData({ orgId: 'org-1' }));

		await load({
			params: { orgId: '1-11-bde' },
			locals,
			cookies,
			url: new URL('https://example.test/org/1-11-bde/critical-tasks/library'),
			depends,
			parent
		} as unknown as Parameters<typeof load>[0]);

		expect(streamCriticalTasksWorkspace).toHaveBeenCalledWith({
			locals,
			cookies,
			orgId: 'org-1',
			includeArchivedTasks: true
		});
	});
});
