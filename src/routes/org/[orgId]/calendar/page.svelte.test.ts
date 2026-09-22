// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { CALENDAR_ANCHOR_COOKIE } from '$features/calendar/utils/calendarAnchorDate';
import type { CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';
import type { CalendarWorkspaceResult } from '$features/calendar/server/calendarWorkspaceBootstrap';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

const { exportMonthToExcelMock, loadCalendarRangeMock, mergeCalendarRangeIntoStoresMock, printMonthCalendarMock } =
	vi.hoisted(() => ({
		exportMonthToExcelMock: vi.fn(),
		loadCalendarRangeMock: vi.fn(),
		mergeCalendarRangeIntoStoresMock: vi.fn(),
		printMonthCalendarMock: vi.fn()
	}));

vi.mock('$features/calendar/utils/calendarExport', () => ({
	exportMonthToExcel: exportMonthToExcelMock,
	printMonthCalendar: printMonthCalendarMock
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		scopeSet: { kind: 'organization' },
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			onboarding: 'configure',
			members: 'configure',
			criticalTasks: 'configure',
			ratingScheme: 'configure',
			reports: 'configure',
			dutyRoster: 'configure'
		},
		hasCapability: vi.fn(() => true),
		affordanceForFeatureAction: vi.fn(() => ({ allowed: true, visible: true, disabled: false })),
		canAccessFeature: vi.fn(() => true)
	})
}));

vi.mock('$features/calendar/utils/calendarRangeLoader', () => ({
	loadCalendarRange: loadCalendarRangeMock,
	mergeCalendarRangeIntoStores: mergeCalendarRangeIntoStoresMock
}));

vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { items: [], loading: false, load: vi.fn() }
}));

vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: { assignments: [], types: [], loading: false, load: vi.fn() }
}));

vi.mock('$features/calendar/stores/specialDays.svelte', () => ({
	specialDaysStore: { items: [], loading: false, load: vi.fn() }
}));

vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: { items: [], loading: false, load: vi.fn() }
}));

vi.mock('$lib/stores/groups.svelte', () => ({
	groupsStore: { items: [], loading: false, names: [] }
}));

vi.mock('$lib/stores/pinnedGroups.svelte', () => ({
	pinnedGroupsStore: { list: [] }
}));

import Page from './+page.svelte';

function makeBootstrap(): CalendarWorkspaceResult {
	return {
		laneKey: 'calendar',
		data: {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-05-31',
			availabilityEntries: [],
			specialDays: [],
			assignmentTypes: [],
			dailyAssignments: [],
			pinnedGroups: [],

			personnel: [
				{
					id: 'p1',
					firstName: 'Alice',
					lastName: 'Smith',
					rank: 'SGT',
					groupId: 'g1',
					groupName: 'Alpha',
					clinicRole: '',
					mos: '11B'
				},
				{
					id: 'p2',
					firstName: 'Bob',
					lastName: 'Jones',
					rank: 'SSG',
					groupId: 'g2',
					groupName: 'Bravo',
					clinicRole: 'Medic',
					mos: '68W'
				}
			],
			groups: [
				{ id: 'g1', name: 'Alpha', sortOrder: 0 },
				{ id: 'g2', name: 'Bravo', sortOrder: 1 }
			],
			statusTypes: [],
			activeOnboardingPersonnelIds: [],
			lossWarningWindowDays: 180
		},
		hydration: {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: [] },
			availabilityEntries: { mode: 'merge', snapshotKey: 'availability:1', items: [] },
			specialDays: { mode: 'merge', snapshotKey: 'special-days:1', items: [] },
			calendarAssignments: {
				mode: 'merge',
				snapshotKey: 'assignments:1',
				items: { types: [], assignments: [] }
			},
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: [] }
		}
	};
}

function makePageData() {
	return {
		...createReadyAppShellRouteData({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1'
		}),
		calendar: {
			data: makeBootstrap()
		}
	};
}

describe('calendar page', () => {
	beforeEach(() => {
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockResolvedValue({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-08-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});
		mergeCalendarRangeIntoStoresMock.mockReset();
		calendarStore.goToMonth(2026, 3);
	});

	afterEach(() => {
		cleanup();
		calendarStore.goToMonth(2026, 3);
	});

	it('loads a larger calendar range on demand when navigating beyond the buffered window', async () => {
		render(Page, {
			props: {
				data: makePageData()
			}
		});

		expect(loadCalendarRangeMock).not.toHaveBeenCalled();

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledWith('org-1', {
				rangeStart: '2026-06-01',
				rangeEnd: '2026-08-31'
			});
		});
	});

	it('keeps the current calendar visible while loading additional dates', async () => {
		let resolveRange: ((value: CalendarRangeData) => void) | undefined;
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRange = resolve;
				})
		);

		render(Page, {
			props: {
				data: makePageData()
			}
		});

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByRole('toolbar', { name: 'Calendar controls' })).toBeTruthy();
		expect(screen.getByText('Loading additional calendar dates...')).toBeTruthy();

		resolveRange?.({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-08-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});
	});

	it('loads the navigated quarter and persists that month for the next server bootstrap', async () => {
		calendarStore.goToMonth(2026, 2);
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=; Max-Age=0; Path=/`;
		render(Page, { props: { data: makePageData() } });

		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		expect(loadCalendarRangeMock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Next 3 Months' }));

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledWith('org-1', {
				rangeStart: '2026-06-01',
				rangeEnd: '2026-08-31'
			});
			expect(document.cookie).toContain(`${CALENDAR_ANCHOR_COOKIE}=2026-06-01`);
		});
	});

	it('keeps the calendar visible when range loading fails and retries only on demand', async () => {
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-08-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});

		render(Page, {
			props: {
				data: makePageData()
			}
		});

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByRole('toolbar', { name: 'Calendar controls' })).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByText('Additional calendar data is temporarily unavailable.')).toBeTruthy();
		});
		expect(screen.getByRole('button', { name: 'Retry calendar load' })).toBeTruthy();

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Retry calendar load' }));

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(2);
		});
	});

	it('stores the viewed calendar month as a bootstrap anchor cookie for future requests', async () => {
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=; Max-Age=0; Path=/`;

		render(Page, {
			props: {
				data: makePageData()
			}
		});

		await waitFor(() => {
			expect(document.cookie).toContain(`${CALENDAR_ANCHOR_COOKIE}=2026-04-01`);
		});

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(document.cookie).toContain(`${CALENDAR_ANCHOR_COOKIE}=2026-08-01`);
		});
	});
});
