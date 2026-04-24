// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonnelPageView from './PersonnelPageView.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import type { OrganizationMemberPermissions, Personnel } from '$lib/types';
import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import type { UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';

const editablePermissions: OrganizationMemberPermissions = {
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
	canViewRatingScheme: true,
	canEditRatingScheme: true,
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
		archivedAt: null,
		ets: null,
		deros: null
	}
];

function makeUpcomingLossRecord(overrides: Partial<UpcomingLossRecord> = {}): UpcomingLossRecord {
	return {
		id: 'person-1',
		personId: 'person-1',
		personName: 'SGT Smith',
		rank: 'SGT',
		lastName: 'Smith',
		triggerType: 'ETS',
		targetDate: '2026-07-01',
		daysRemaining: 78,
		awardDueSoon: true,
		awardTrackingAcknowledged: false,
		groupId: 'group-1',
		...overrides
	};
}

function makeCtx(
	handleEdit = vi.fn(),
	upcomingLossMap: Map<string, UpcomingLossRecord> = new Map()
): PersonnelPageContext {
	return {
		data: { orgId: 'org-1', scopedGroupId: null },
		orgId: 'org-1',
		canAddPersonnel: false,
		viewMode: 'alphabetical',
		totalPersonnel: personnel.length,
		upcomingLossMap,
		handleEdit,
		handleAdd: vi.fn(),
		openGroupManager: vi.fn(),
		openBulkManager: vi.fn()
	} as unknown as PersonnelPageContext;
}

describe('PersonnelPageView', () => {
	beforeEach(() => {
		personnelStore.load(personnel, 'org-1');
		pinnedGroupsStore.load([], 'org-1');
		subscriptionStore.clear();
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		pinnedGroupsStore.load([], 'org-test-reset');
		subscriptionStore.clear();
		vi.unstubAllGlobals();
	});

	it('uses Duty Role as the roster column header', () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, permissions: viewOnlyPermissions }
		});

		expect(screen.getByRole('columnheader', { name: 'Duty Role' })).toBeTruthy();
	});

	describe('upcoming-loss indicators', () => {
		it('shows a loss indicator chip for personnel in the upcoming-loss map', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = makeCtx(vi.fn(), lossMap);

			render(PersonnelPageView, {
				props: { ctx, permissions: viewOnlyPermissions }
			});

			// The ETS chip should appear in the roster row
			expect(screen.getByTestId('loss-indicator-person-1')).toBeTruthy();
		});

		it('shows the correct trigger type label for an ETS indicator', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = makeCtx(vi.fn(), lossMap);

			render(PersonnelPageView, {
				props: { ctx, permissions: viewOnlyPermissions }
			});

			expect(screen.getByTestId('loss-indicator-person-1').textContent).toBe('ETS');
		});

		it('shows PCS label for a PCS / DEROS indicator', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'PCS / DEROS' })]]);
			const ctx = makeCtx(vi.fn(), lossMap);

			render(PersonnelPageView, {
				props: { ctx, permissions: viewOnlyPermissions }
			});

			expect(screen.getByTestId('loss-indicator-person-1').textContent).toBe('PCS');
		});

		it('does not show a loss indicator for personnel not in the upcoming-loss map', () => {
			// Empty map — person-1 is not approaching any loss
			const ctx = makeCtx(vi.fn(), new Map());

			render(PersonnelPageView, {
				props: { ctx, permissions: viewOnlyPermissions }
			});

			expect(screen.queryByTestId('loss-indicator-person-1')).toBeNull();
		});

		it('shows an award acknowledgement action in the row actions when the loss indicator is present', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = makeCtx(vi.fn(), lossMap);

			render(PersonnelPageView, {
				props: { ctx, permissions: editablePermissions }
			});

			expect(screen.getByTestId('award-ack-action-person-1').textContent).toBe('Ack award');
		});

		it('does not show an award acknowledgement action for personnel outside the upcoming-loss window', () => {
			const ctx = makeCtx(vi.fn(), new Map());

			render(PersonnelPageView, {
				props: { ctx, permissions: editablePermissions }
			});

			expect(screen.queryByTestId('award-ack-action-person-1')).toBeNull();
		});

		it('posts award acknowledgement changes from the row actions column', async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue({
				ok: true,
				json: async () => ({ personnelId: 'person-1', awardTrackingAcknowledged: true })
			} as Response);
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = makeCtx(vi.fn(), lossMap);

			render(PersonnelPageView, {
				props: { ctx, permissions: editablePermissions }
			});

			await fireEvent.click(screen.getByTestId('award-ack-action-person-1'));

			await waitFor(() => {
				expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/award-tracking', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ acknowledged: true })
				});
			});

			await waitFor(() => {
				expect(screen.getByTestId('award-ack-action-person-1').textContent).toBe('Clear ack');
			});
		});
	});

	it('updates personnel row edit affordances when permissions change after render', async () => {
		const handleEdit = vi.fn();
		const ctx = makeCtx(handleEdit);
		const view = render(PersonnelPageView, {
			props: {
				ctx,
				permissions: editablePermissions
			}
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		handleEdit.mockClear();

		await view.rerender({
			ctx,
			permissions: viewOnlyPermissions
		});

		expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();

		const row = screen.getByText('Smith, Jane').closest('tr');
		expect(row).toBeTruthy();
		await fireEvent.click(row!);

		expect(handleEdit).not.toHaveBeenCalled();
	});

	it('keeps rating scheme controls out of the Personnel roster page', () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, permissions: editablePermissions }
		});

		expect(screen.queryByRole('button', { name: 'Rating Scheme' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Add Entry' })).toBeNull();
	});
});
