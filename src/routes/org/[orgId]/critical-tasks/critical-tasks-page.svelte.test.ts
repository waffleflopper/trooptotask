// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
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
	})
}));

describe('critical tasks page', () => {
	beforeEach(() => {
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
});
