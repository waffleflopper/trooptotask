// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonnelPageView from './PersonnelPageView.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import type { OrganizationMemberPermissions, Personnel } from '$lib/types';
import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';

const editablePermissions: OrganizationMemberPermissions = {
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
};

const viewOnlyPermissions: OrganizationMemberPermissions = {
	...editablePermissions,
	canEditPersonnel: false
};

const personnel: Personnel[] = [
	{
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: 'Alpha',
		archivedAt: null
	}
];

function makeCtx(handleEdit = vi.fn()): PersonnelPageContext {
	return {
		data: { scopedGroupId: null },
		canAddPersonnel: false,
		pageView: 'roster',
		viewMode: 'alphabetical',
		evalTypeFilter: 'all',
		ratingFilter: 'active',
		workflowFilter: 'all',
		filteredRatingEntries: [],
		totalPersonnel: personnel.length,
		handleEdit,
		handleAdd: vi.fn(),
		openGroupManager: vi.fn(),
		openBulkManager: vi.fn(),
		handleAddRatingEntry: vi.fn(),
		handleEditRatingEntry: vi.fn()
	} as unknown as PersonnelPageContext;
}

describe('PersonnelPageView', () => {
	beforeEach(() => {
		personnelStore.load(personnel, 'org-1');
		ratingSchemeStore.load([], 'org-1');
		pinnedGroupsStore.load([], 'org-1');
		subscriptionStore.clear();
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		ratingSchemeStore.load([], 'org-test-reset');
		pinnedGroupsStore.load([], 'org-test-reset');
		subscriptionStore.clear();
	});

	it('updates personnel row edit affordances when permissions change after render', async () => {
		const handleEdit = vi.fn();
		const ctx = makeCtx(handleEdit);
		const view = render(PersonnelPageView, {
			props: {
				ctx,
				personnelLookup: [],
				permissions: editablePermissions,
				onPageViewChange: vi.fn()
			}
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		handleEdit.mockClear();

		await view.rerender({
			ctx,
			personnelLookup: [],
			permissions: viewOnlyPermissions,
			onPageViewChange: vi.fn()
		});

		expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();

		const row = screen.getByText('Smith, Jane').closest('tr');
		expect(row).toBeTruthy();
		await fireEvent.click(row!);

		expect(handleEdit).not.toHaveBeenCalled();
	});
});
