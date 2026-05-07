// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import CalendarPageView from './CalendarPageView.svelte';
import { CalendarPageContext, type CalendarPageData } from '../contexts/CalendarPageContext.svelte';
import { createOrgContext, type OrgContext } from '$lib/stores/orgContext.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

const { exportMonthToCSVMock, printMonthCalendarMock } = vi.hoisted(() => ({
	exportMonthToCSVMock: vi.fn(),
	printMonthCalendarMock: vi.fn()
}));

vi.mock('$features/calendar/utils/calendarExport', () => ({
	exportMonthToCSV: exportMonthToCSVMock,
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

function makeMockOrg(overrides: Partial<OrgContext> = {}): OrgContext {
	const defaultCapabilityMap = {
		calendar: 'view',
		personnel: 'view',
		training: 'view',
		criticalTasks: 'view',
		onboarding: 'view',
		ratingScheme: 'view'
	} satisfies OrgContext['capabilityMap'];
	const configureCapabilityMap = {
		calendar: 'configure',
		personnel: 'configure',
		training: 'configure',
		criticalTasks: 'configure',
		onboarding: 'configure',
		ratingScheme: 'configure'
	} satisfies OrgContext['capabilityMap'];

	return createOrgContext({
		orgId: 'org1',
		orgName: 'Test Org',
		userId: 'user1',
		userRole: overrides.isOwner ? 'owner' : overrides.isAdmin ? 'admin' : (overrides.role ?? 'member'),
		capabilityMap:
			overrides.capabilityMap ??
			(overrides.isOwner || overrides.isAdmin || overrides.isFullEditor
				? configureCapabilityMap
				: defaultCapabilityMap),
		scopeSet: overrides.scopeSet ?? { kind: 'organization' },
		permissions: {} as OrgContext['permissions'],
		scopedGroupId: null,
		isReadOnly: overrides.readOnly ?? false
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

		expect(ctx.calendarPersonnelSearch).toBe('medic');
		expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [filterPersonnel[1]] }]);
	});
});
