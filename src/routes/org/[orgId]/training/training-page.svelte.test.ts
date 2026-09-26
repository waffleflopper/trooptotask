// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { groupCatalogHydration } from '$features/personnel';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			onboarding: 'configure',
			members: 'configure',
			criticalTasks: 'configure',
			ratingScheme: 'configure',
			reports: 'configure'
		},
		hasCapability: vi.fn(() => true),
		scopeSet: { kind: 'organization' },
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
		...createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Unit' }),
		training: {
			data: new Promise(() => undefined)
		}
	};
}

describe('training page', () => {
	beforeEach(() => {
		personnelRosterHydration.startLoading();
		groupCatalogHydration.startLoading();
		trainingTypesStore.startLoading();
		trainingViewsStore.startLoading();
		personnelTrainingsStore.startLoading();
		pinnedGroupsStore.load([], 'org-1');
	});

	afterEach(() => {
		cleanup();
		personnelRosterHydration.load([], 'org-test-reset');
		groupCatalogHydration.load([], 'org-test-reset');
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
