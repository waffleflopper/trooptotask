// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';

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
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
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

const activeTask: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const activeCompletion: PersonnelIctCompletion = {
	id: 'completion-1',
	personnelId: 'person-1',
	ictTaskId: 'task-1',
	completedAt: '2026-04-01',
	validationMethod: 'Lecture',
	validatedBy: 'SFC Observer',
	notes: null,
	loggedBy: 'user-1',
	createdAt: '2026-04-01T12:00:00Z'
};

describe('critical tasks personnel detail route', () => {
	beforeEach(() => {
		ictTasksStore.startLoading();
		personnelIctCompletionsStore.startLoading();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('shows a route loading state until critical task stores hydrate for the org', () => {
		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					criticalTasksPersonnelHistory: {
						personnel: {
							id: 'person-1',
							rank: 'SGT',
							firstName: 'Jane',
							lastName: 'Smith',
							mos: '68W',
							clinicRole: 'Medic',
							groupId: 'group-alpha',
							groupName: 'Alpha'
						},
						rows: []
					}
				}
			}
		});

		expect(screen.getByRole('status')).toBeTruthy();
		expect(screen.getByText('Loading critical task record...')).toBeTruthy();
		expect(screen.queryByText('Applicable Critical Tasks')).toBeNull();
	});

	it('renders the personnel detail page once the shared critical task stores are hydrated', () => {
		ictTasksStore.load([activeTask], 'org-1');
		personnelIctCompletionsStore.load([activeCompletion], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					},
					criticalTasksPersonnelHistory: {
						personnel: {
							id: 'person-1',
							rank: 'SGT',
							firstName: 'Jane',
							lastName: 'Smith',
							mos: '68W',
							clinicRole: 'Medic',
							groupId: 'group-alpha',
							groupName: 'Alpha'
						},
						rows: []
					}
				}
			}
		});

		expect(screen.getByText('Applicable Critical Tasks')).toBeTruthy();
		expect(screen.getByText('181-105-1001')).toBeTruthy();
	});
});
