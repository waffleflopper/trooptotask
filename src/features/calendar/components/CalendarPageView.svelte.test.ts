// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import CalendarPageView from './CalendarPageView.svelte';
import { CalendarPageContext, type CalendarPageData } from '../contexts/CalendarPageContext.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import {
	createTestOrgContext,
	FULL_TEST_CAPABILITY_MAP,
	VIEW_TEST_CAPABILITY_MAP
} from '$lib/test-support/orgContextBuilder';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { calendarStore } from '../stores/calendar.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

const { exportMonthToExcelMock, printMonthCalendarMock } = vi.hoisted(() => ({
	exportMonthToExcelMock: vi.fn(),
	printMonthCalendarMock: vi.fn()
}));

vi.mock('$features/calendar/utils/calendarExport', () => ({
	exportMonthToExcel: exportMonthToExcelMock,
	printMonthCalendar: printMonthCalendarMock
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
	groupsStore: { items: [], loading: false }
}));

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	calendarStore.goToToday();
});

const mutableAvailabilityStore = availabilityStore as unknown as { loading: boolean };
const mutableDailyAssignmentsStore = dailyAssignmentsStore as unknown as { loading: boolean };
const mutableSpecialDaysStore = specialDaysStore as unknown as { loading: boolean };
const mutableStatusTypesStore = statusTypesStore as unknown as { loading: boolean };
const mutableGroupsStore = groupsStore as unknown as { loading: boolean };

const mockData: CalendarPageData = {
	orgId: 'org1',
	orgName: 'Test Org',
	userId: 'user1',
	personnel: [],
	allPersonnel: []
};

const filterPersonnel: Personnel[] = [
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
];

function makeMockOrg(
	overrides: {
		userRole?: 'owner' | 'admin' | 'member';
		capabilityMap?: import('$lib/access/memberAccessShape').CapabilityMap;
		scopeSet?: import('$lib/access/memberAccessShape').ScopeSet;
	} = {}
) {
	const role = overrides.userRole ?? 'member';
	const isPrivileged = role === 'owner' || role === 'admin';
	return createTestOrgContext({
		orgId: 'org1',
		userId: 'user1',
		userRole: role,
		capabilityMap: overrides.capabilityMap ?? (isPrivileged ? FULL_TEST_CAPABILITY_MAP : VIEW_TEST_CAPABILITY_MAP),
		scopeSet: overrides.scopeSet
	});
}

describe('CalendarPageView', () => {
	it('renders a loading placeholder while composite data is hydrating', () => {
		mutableAvailabilityStore.loading = true;
		mutableDailyAssignmentsStore.loading = false;
		mutableSpecialDaysStore.loading = false;
		mutableStatusTypesStore.loading = false;
		mutableGroupsStore.loading = false;

		const ctx = new CalendarPageContext(mockData, makeMockOrg());

		render(CalendarPageView, {
			props: {
				ctx,
				data: {
					orgId: mockData.orgId,
					orgName: 'Test Org'
				}
			}
		});

		expect(screen.getByText('Loading calendar data')).toBeTruthy();
		expect(screen.getAllByTestId('skeleton-grid-cell').length).toBeGreaterThan(0);
		expect(screen.queryByText('No personnel added yet.')).toBeNull();
		expect(screen.queryByText('Access Restricted')).toBeNull();
	});

	it('moves forward across the year boundary and back through the month controls', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 11);
		const ctx = new CalendarPageContext(
			{ ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel },
			makeMockOrg()
		);
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		expect(screen.getByRole('button', { name: /December 2026/ })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(screen.getByRole('button', { name: /January 2027/ })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
		expect(screen.getByRole('button', { name: /December 2026/ })).toBeTruthy();
	});

	it('retains Today from three-month view when returning to the month calendar', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 8, 22, 12));
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 11);
		const ctx = new CalendarPageContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
		expect(screen.getByRole('button', { name: /September 2026.*November 2026/ })).toBeTruthy();
		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		expect(screen.getByRole('button', { name: /September 2026/ })).toBeTruthy();
	});

	it('keeps quarter arrows and picker on the Calendar-owned month across a year boundary', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 11);
		const ctx = new CalendarPageContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		await fireEvent.click(screen.getByRole('button', { name: 'Next 3 Months' }));
		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		expect(screen.getByRole('button', { name: /March 2027/ })).toBeTruthy();
		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		await fireEvent.click(screen.getByRole('button', { name: 'Prev 3 Months' }));
		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		expect(screen.getByRole('button', { name: /December 2026/ })).toBeTruthy();
		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		await fireEvent.click(screen.getByTestId('long-range-date-label'));
		await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Jan' }));
		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));
		expect(screen.getByRole('button', { name: /January 2027/ })).toBeTruthy();
	});

	it('wires typed personnel search into the rendered calendar roster', async () => {
		mutableAvailabilityStore.loading = false;
		mutableDailyAssignmentsStore.loading = false;
		mutableSpecialDaysStore.loading = false;
		mutableStatusTypesStore.loading = false;
		mutableGroupsStore.loading = false;

		const data = {
			...mockData,
			personnel: filterPersonnel,
			allPersonnel: filterPersonnel
		};
		const ctx = new CalendarPageContext(data, makeMockOrg());

		render(CalendarPageView, {
			props: {
				ctx,
				data: {
					orgId: data.orgId,
					orgName: 'Test Org'
				}
			}
		});

		const personnelSearch = screen.getByRole('searchbox', { name: 'Search by name, rank, MOS, role, or group' });
		await fireEvent.input(personnelSearch, { target: { value: 'medic' } });

		expect(await screen.findByRole('button', { name: /Jones, Bob/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Bravo/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Smith, Alice/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /Alpha/ })).toBeNull();
	});
});
