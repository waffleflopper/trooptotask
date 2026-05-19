// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import type { OrganizationMemberPermissions, Personnel } from '$lib/types';
import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import type { UpcomingLossRecord } from '$lib/domain/readinessSignals';
import type { ClientAffordance } from '$lib/stores/orgContext.svelte';

const { gotoMock, invalidateAllMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	invalidateAllMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidateAll: invalidateAllMock
}));

import PersonnelPageView from './PersonnelPageView.svelte';

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
		deros: null,
		slug: 'smith-jane'
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
		canImportPersonnel: false,
		canManageGroups: false,
		canManagePersonnelRecord: () => false,
		canArchivePersonnelRecord: () => false,
		personnelRecordAffordance: () => deniedAffordance(),
		personnelArchiveAffordance: () => deniedAffordance(),
		viewMode: 'alphabetical',
		totalPersonnel: personnel.length,
		upcomingLossMap,
		handleEdit,
		handleAdd: vi.fn(),
		openGroupManager: vi.fn(),
		openBulkManager: vi.fn()
	} as unknown as PersonnelPageContext;
}

function allowedAffordance(overrides: Partial<ClientAffordance> = {}): ClientAffordance {
	return {
		allowed: true,
		visible: true,
		disabled: false,
		reason: 'allowed:capability',
		explanation: '',
		decision: {} as never,
		...overrides
	};
}

function deniedAffordance(overrides: Partial<ClientAffordance> = {}): ClientAffordance {
	return {
		allowed: false,
		visible: false,
		disabled: false,
		reason: 'denied:missing-capability',
		explanation: '',
		decision: {} as never,
		...overrides
	};
}

describe('PersonnelPageView', () => {
	beforeEach(() => {
		personnelStore.load(personnel, 'org-1');
		pinnedGroupsStore.load([], 'org-1');
		subscriptionStore.clear();
		vi.stubGlobal('fetch', vi.fn());
		gotoMock.mockReset();
		invalidateAllMock.mockReset();
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

	it('uses a compact command strip without the old summary noise', () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, permissions: viewOnlyPermissions }
		});

		expect(screen.queryByRole('heading', { name: 'Personnel' })).toBeNull();
		expect(screen.queryByText('Total Personnel')).toBeNull();
		expect(screen.queryByText('Groups')).toBeNull();
		expect(screen.queryByText('Unassigned')).toBeNull();
		expect(screen.queryByText('Access')).toBeNull();
		expect(screen.getByRole('group', { name: 'Roster sort mode' })).toBeTruthy();
		expect(screen.getByTestId('personnel-search')).toBeTruthy();
	});

	it('keeps primary personnel actions visible in the floating toolbar for editors', () => {
		const ctx = {
			...makeCtx(),
			canAddPersonnel: true,
			canImportPersonnel: true,
			canManageGroups: true,
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, permissions: editablePermissions }
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).getByRole('button', { name: 'Manage Groups' })).toBeTruthy();
		expect(within(toolbar).getByRole('button', { name: 'Add Person' })).toBeTruthy();
		expect(within(toolbar).getByRole('button', { name: 'Import' })).toBeTruthy();
		expect(within(toolbar).queryByRole('button', { name: 'Bulk Import' })).toBeNull();
	});

	it('keeps creation and group controls hidden for operators who can edit existing personnel', () => {
		const ctx = {
			...makeCtx(),
			canAddPersonnel: false,
			canImportPersonnel: false,
			canManageGroups: false,
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, permissions: editablePermissions }
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Manage Groups' })).toBeNull();
		expect(within(toolbar).queryByRole('button', { name: 'Add Person' })).toBeNull();
		expect(within(toolbar).queryByRole('button', { name: 'Import' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy();
	});

	it('filters the roster from the toolbar search item', async () => {
		personnelStore.load(
			[
				...personnel,
				{
					id: 'person-2',
					rank: 'SPC',
					lastName: 'Garcia',
					firstName: 'Luis',
					mos: '11B',
					clinicRole: 'Rifleman',
					groupId: 'group-2',
					groupName: 'Bravo',
					archivedAt: null,
					ets: null,
					deros: null
				}
			],
			'org-1'
		);
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, permissions: viewOnlyPermissions }
		});

		await fireEvent.input(screen.getByTestId('personnel-search'), { target: { value: 'Garcia' } });

		expect(screen.getByText('Garcia, Luis')).toBeTruthy();
		expect(screen.queryByText('Smith, Jane')).toBeNull();
	});

	it('updates the roster view mode from the toolbar view toggle', async () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, permissions: viewOnlyPermissions }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Group' }));

		expect(ctx.viewMode).toBe('by-group');
	});

	it('renders grouped roster pin controls without crashing', () => {
		const ctx = {
			...makeCtx(),
			viewMode: 'by-group'
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, permissions: viewOnlyPermissions }
		});

		expect(screen.getByRole('button', { name: 'Pin Alpha' })).toBeTruthy();
	});

	describe('upcoming-loss indicators', () => {
		it('shows a loss indicator chip for personnel in the upcoming-loss map', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = {
				...makeCtx(vi.fn(), lossMap),
				canManagePersonnelRecord: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			} as unknown as PersonnelPageContext;

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

		it('does not show an award acknowledgement action when the loss indicator is present', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = {
				...makeCtx(vi.fn(), lossMap),
				canManagePersonnelRecord: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			} as unknown as PersonnelPageContext;

			render(PersonnelPageView, {
				props: { ctx, permissions: editablePermissions }
			});

			expect(screen.getByTestId('loss-indicator-person-1')).toBeTruthy();
			expect(screen.queryByTestId('award-ack-action-person-1')).toBeNull();
			expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
		});

		it('does not show an award acknowledgement action for personnel outside the upcoming-loss window', () => {
			const ctx = makeCtx(vi.fn(), new Map());

			render(PersonnelPageView, {
				props: { ctx, permissions: editablePermissions }
			});

			expect(screen.queryByTestId('award-ack-action-person-1')).toBeNull();
		});
	});

	it('updates personnel row edit affordances when permissions change after render', async () => {
		const handleEdit = vi.fn();
		const editableCtx = {
			...makeCtx(handleEdit),
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;
		const viewOnlyCtx = {
			...makeCtx(handleEdit),
			canManagePersonnelRecord: () => false,
			personnelRecordAffordance: () => deniedAffordance()
		} as unknown as PersonnelPageContext;
		const view = render(PersonnelPageView, {
			props: {
				ctx: editableCtx,
				permissions: viewOnlyPermissions
			}
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		handleEdit.mockClear();

		await view.rerender({
			ctx: viewOnlyCtx,
			permissions: editablePermissions
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();

		const row = screen.getByText('Smith, Jane').closest('tr');
		expect(row).toBeTruthy();
		await fireEvent.click(row!);

		expect(handleEdit).not.toHaveBeenCalled();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('opens the personnel detail page from row clicks and keeps edit as a modal action', async () => {
		const handleEdit = vi.fn();
		const ctx = {
			...makeCtx(handleEdit),
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, permissions: editablePermissions }
		});

		const row = screen.getByText('Smith, Jane').closest('tr');
		expect(row).toBeTruthy();
		await fireEvent.click(row!);

		expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel/smith-jane');
		expect(handleEdit).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		expect(handleEdit).toHaveBeenCalledWith(personnel[0]);
		expect(gotoMock).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
		expect(gotoMock).toHaveBeenCalledTimes(2);
		expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel/smith-jane');
	});

	it('uses per-record policy affordances instead of legacy canEditPersonnel for edit actions', () => {
		const ctx = {
			...makeCtx(),
			canManagePersonnelRecord: (person: Personnel) => person.id === 'person-1',
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, permissions: viewOnlyPermissions }
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
	});

	it('archives personnel from a roster icon action after confirmation', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ success: true })
		});
		vi.stubGlobal('fetch', fetchMock);
		const ctx = {
			...makeCtx(),
			canManagePersonnelRecord: () => true,
			canArchivePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance(),
			personnelArchiveAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, permissions: editablePermissions }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'person-1' })
		});
		await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
		expect(screen.queryByText('Smith, Jane')).toBeNull();
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
