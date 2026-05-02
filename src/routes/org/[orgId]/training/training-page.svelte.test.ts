// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
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
		readOnly: false,
		affordanceForFeatureAction: () => ({
			allowed: true,
			visible: true,
			disabled: false,
			reason: 'allowed:capability',
			explanation: '',
			decision: {}
		})
	})
}));

function makePageData() {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userPreferences: {},
		permissions: {
			canViewTraining: true,
			canEditTraining: true
		},
		training: {
			data: new Promise(() => undefined)
		}
	};
}

describe('training page', () => {
	beforeEach(() => {
		personnelStore.startLoading();
		groupsStore.startLoading();
		trainingTypesStore.startLoading();
		trainingViewsStore.startLoading();
		personnelTrainingsStore.startLoading();
		pinnedGroupsStore.load([], 'org-1');
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
		pinnedGroupsStore.load([], 'org-test-reset');
	});

	it('renders the training shell while workspace data is still streaming', () => {
		render(Page, {
			props: {
				data: makePageData()
			}
		});

		expect(screen.getByRole('toolbar', { name: 'Training controls' })).toBeTruthy();
		expect(screen.queryByTestId('page-toolbar')).toBeNull();
		expect(screen.getByTestId('skeleton-grid')).toBeTruthy();
	});
});
