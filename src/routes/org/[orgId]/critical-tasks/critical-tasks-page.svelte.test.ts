// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';

const { mockOrgContext } = vi.hoisted(() => ({
	mockOrgContext: {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		},
		scopedGroupId: null,
		readOnly: false
	}
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => mockOrgContext
}));

const ictTask: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: [],
	expirationMonths: null,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

describe('critical tasks page', () => {
	beforeEach(() => {
		mockOrgContext.role = 'owner';
		mockOrgContext.isOwner = true;
		mockOrgContext.isAdmin = false;
		mockOrgContext.isPrivileged = true;
		mockOrgContext.isFullEditor = true;
		personnelStore.startLoading();
		groupsStore.startLoading();
		ictTasksStore.startLoading();
		personnelIctCompletionsStore.startLoading();
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('renders the Critical Tasks shell while workspace data is still streaming', () => {
		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					},
					criticalTasks: {
						data: new Promise(() => undefined)
					}
				}
			}
		});

		expect(screen.getByText('Critical Tasks')).toBeTruthy();
		expect(screen.getByText('ICTL readiness')).toBeTruthy();
		expect(screen.getByTestId('critical-tasks-loading')).toBeTruthy();
	});

	it('shows the task library affordance to owners and admins', async () => {
		personnelStore.load([], 'org-1');
		groupsStore.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /more/i }));

		const link = screen.getByRole('menuitem', { name: 'Task Library' });
		expect(link.getAttribute('href')).toBe('/org/org-1/critical-tasks/library');
	});

	it('omits the task library affordance for non-admin training editors', () => {
		mockOrgContext.role = 'member';
		mockOrgContext.isOwner = false;
		mockOrgContext.isPrivileged = false;
		mockOrgContext.isFullEditor = true;
		personnelStore.load([], 'org-1');
		groupsStore.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					}
				}
			}
		});

		expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Task Library' })).toBeNull();
	});
});
