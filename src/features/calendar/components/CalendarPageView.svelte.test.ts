// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import CalendarPageView from './CalendarPageView.svelte';
import { CalendarPageContext, type CalendarPageData } from '../contexts/CalendarPageContext.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

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
	allPersonnel: [],
	scopedGroupId: null,
	permissions: {
		canViewCalendar: true,
		canEditCalendar: true
	}
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
	return {
		orgId: 'org1',
		orgName: 'Test Org',
		userId: 'user1',
		role: 'member',
		isOwner: false,
		isAdmin: false,
		isPrivileged: false,
		isFullEditor: false,
		permissions: {} as OrgContext['permissions'],
		scopedGroupId: null,
		readOnly: false,
		...overrides
	};
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
					orgName: 'Test Org',
					permissions: mockData.permissions
				}
			}
		});

		expect(screen.getByText('Loading calendar data')).toBeTruthy();
		expect(screen.getAllByTestId('skeleton-grid-cell').length).toBeGreaterThan(0);
		expect(screen.queryByText('No personnel added yet.')).toBeNull();
		expect(screen.queryByText('Access Restricted')).toBeNull();
	});

	it('wires group filtering into the rendered calendar roster', async () => {
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
					orgName: 'Test Org',
					permissions: data.permissions
				}
			}
		});

		const groupFilter = screen.getByRole('combobox', { name: 'Calendar group filter' });
		await fireEvent.change(groupFilter, { target: { value: 'g2' } });

		expect(ctx.calendarGroupFilter).toBe('g2');
		expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [filterPersonnel[1]] }]);
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
					orgName: 'Test Org',
					permissions: data.permissions
				}
			}
		});

		const personnelSearch = screen.getByRole('searchbox', { name: 'Search by name, rank, MOS, role, or group' });
		await fireEvent.input(personnelSearch, { target: { value: 'medic' } });

		expect(ctx.calendarPersonnelSearch).toBe('medic');
		expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [filterPersonnel[1]] }]);
	});
});
