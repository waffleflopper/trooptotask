// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import CalendarPageView from './CalendarPageView.svelte';
import { CalendarPageContext, type CalendarPageData } from '../contexts/CalendarPageContext.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { calendarStore } from '../stores/calendar.svelte';
import { groupsStore } from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import { tick } from 'svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';

const gotoMock = vi.hoisted(() => vi.fn());

const exportMocks = vi.hoisted(() => ({
	exportMonthToExcel: vi.fn(),
	printMonthCalendar: vi.fn(),
	exportQuarterToExcel: vi.fn(),
	printQuarterCalendar: vi.fn()
}));

vi.mock('$features/calendar/utils/calendarExport', () => exportMocks);
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: gotoMock
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
vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	groupsStore: { items: [], loading: false }
}));

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	calendarStore.goToToday();
});

function toolbar(): HTMLElement {
	return screen.getByRole('toolbar', { name: 'Calendar controls' });
}

async function showView(name: 'Month' | '3-Month'): Promise<void> {
	await fireEvent.click(within(toolbar()).getByRole('button', { name }));
}

async function openMore(): Promise<HTMLElement> {
	const trigger = within(toolbar()).getByRole('button', { name: 'More Calendar controls' });
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	return screen.findByRole('menu');
}

async function chooseFromMore(name: string): Promise<void> {
	const menu = await openMore();
	await fireEvent.click(within(menu).getByRole('menuitem', { name }));
	await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

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

function makeContext(
	data: ConstructorParameters<typeof CalendarPageContext>[0],
	org: ConstructorParameters<typeof CalendarPageContext>[1]
) {
	return new CalendarPageContext(data, org, vi.fn());
}

function makeMockOrg(
	overrides: {
		userRole?: 'owner' | 'admin' | 'member';
		capabilityMap?: import('$lib/access/memberAccessShape').CapabilityMap;
		scopeSet?: import('$lib/access/memberAccessShape').ScopeSet;
	} = {}
) {
	const role = overrides.userRole ?? 'member';
	const isPrivileged = role === 'owner' || role === 'admin';
	return {
		userId: 'user1',
		...createClientAccess({
			membershipRole: role,
			capabilityMap:
				overrides.capabilityMap ?? (isPrivileged ? createCapabilityMap('configure') : createCapabilityMap('view')),
			scopeSet: overrides.scopeSet
		})
	};
}

describe('CalendarPageView', () => {
	it('renders a loading placeholder while composite data is hydrating', () => {
		mutableAvailabilityStore.loading = true;
		mutableDailyAssignmentsStore.loading = false;
		mutableSpecialDaysStore.loading = false;
		mutableStatusTypesStore.loading = false;
		mutableGroupsStore.loading = false;

		const ctx = makeContext(mockData, makeMockOrg());

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
		const ctx = makeContext({ ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel }, makeMockOrg());
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
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		await showView('3-Month');
		await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
		expect(screen.getByRole('button', { name: /September 2026.*November 2026/ })).toBeTruthy();
		await showView('Month');
		expect(screen.getByRole('button', { name: /September 2026/ })).toBeTruthy();
	});

	it('keeps quarter arrows and picker on the Calendar-owned month across a year boundary', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 11);
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		await showView('3-Month');
		await fireEvent.click(screen.getByRole('button', { name: 'Next 3 Months' }));
		await showView('Month');
		expect(screen.getByRole('button', { name: /March 2027/ })).toBeTruthy();
		await showView('3-Month');
		await fireEvent.click(screen.getByRole('button', { name: 'Prev 3 Months' }));
		await showView('Month');
		expect(screen.getByRole('button', { name: /December 2026/ })).toBeTruthy();
		await showView('3-Month');
		await fireEvent.click(screen.getByTestId('long-range-date-label'));
		await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Jan' }));
		await showView('Month');
		expect(screen.getByRole('button', { name: /January 2027/ })).toBeTruthy();
	});

	it('says loss warnings are unavailable and offers a reload when the window could not be read', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		mutableAvailabilityStore.loading = false;
		mutableDailyAssignmentsStore.loading = false;
		mutableSpecialDaysStore.loading = false;
		mutableStatusTypesStore.loading = false;
		mutableGroupsStore.loading = false;
		const personnel = [{ ...filterPersonnel[0], ets: '2026-04-20' }];
		const data = {
			...mockData,
			personnel,
			allPersonnel: personnel,
			calendar: { data: { personnel, lossWarningWindowDays: null } }
		};

		render(CalendarPageView, {
			props: { ctx: makeContext(data, makeMockOrg()), data: { orgId: data.orgId, orgName: 'Test Org' } }
		});

		expect(screen.getByText(/Loss warnings could not be loaded/).closest('[role="status"]')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
		expect(reload).toHaveBeenCalledOnce();
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
		const ctx = makeContext(data, makeMockOrg());

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

		expect(await screen.findByRole('button', { name: /Jones, Bob$/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Bravo/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Smith, Alice/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /Alpha/ })).toBeNull();
	});

	it('marks the shown calendar view as pressed in the toolbar', async () => {
		mutableAvailabilityStore.loading = false;
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		const view = within(toolbar()).getByRole('group', { name: 'Calendar view' });
		expect(within(view).getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
		await showView('3-Month');
		expect(within(view).getByRole('button', { name: '3-Month' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByTestId('long-range-date-label')).toBeTruthy();
	});

	it('reaches every Calendar control an admin may use from More when the row folds', async () => {
		mutableAvailabilityStore.loading = false;
		const { layOut } = stubToolbarWidths();
		calendarStore.goToMonth(2026, 11);
		const ctx = makeContext(mockData, makeMockOrg({ userRole: 'owner' }));
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await layOut(1);

		expect(within(toolbar()).queryByRole('link', { name: 'Reports' })).toBeNull();
		expect(within(toolbar()).getByRole('button', { name: 'Bulk Status' }), 'the primary stays on the row').toBeTruthy();
		const menu = await openMore();
		expect(within(menu).getByRole('menuitemradio', { name: '3-Month' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Group, Group: All' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Planning' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Reports' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toBeTruthy();
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Export to Excel' }));
		await waitFor(() => expect(exportMocks.exportMonthToExcel).toHaveBeenCalledTimes(1));
		expect(exportMocks.exportMonthToExcel.mock.calls[0].slice(0, 2)).toEqual([2026, 11]);
	});

	it('sends Planning, Reports and Settings to their Calendar routes from the row and from More', async () => {
		mutableAvailabilityStore.loading = false;
		const { layOut } = stubToolbarWidths();
		const ctx = makeContext(mockData, makeMockOrg({ userRole: 'owner' }));
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await layOut(4000);

		expect(within(toolbar()).getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe(
			'/org/org1/calendar/reports'
		);
		expect(within(toolbar()).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe(
			'/org/org1/calendar/settings'
		);
		await layOut(1);

		await chooseFromMore('Reports');
		await chooseFromMore('Settings');
		const menu = await openMore();
		const planning = within(menu).getByRole('menuitem', { name: 'Planning' });
		planning.focus();
		await fireEvent.keyDown(planning, { key: 'ArrowRight' });
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Assignment Planner' }));

		expect(gotoMock.mock.calls.map(([href]) => href)).toEqual([
			'/org/org1/calendar/reports',
			'/org/org1/calendar/settings',
			'/org/org1/calendar/assignments'
		]);
	});

	it('filters the roster from the folded Group submenu', async () => {
		mutableAvailabilityStore.loading = false;
		const { layOut } = stubToolbarWidths();
		const data = { ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel };
		const ctx = makeContext(data, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await layOut(1);

		const menu = await openMore();
		const group = within(menu).getByRole('menuitem', { name: 'Group, Group: All' });
		group.focus();
		await fireEvent.keyDown(group, { key: 'ArrowRight' });
		await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Bravo (1)' }));

		await waitFor(() => expect(screen.queryByRole('button', { name: /Smith, Alice/ })).toBeNull());
		expect(screen.getByRole('button', { name: /Jones, Bob$/ })).toBeTruthy();
		expect(ctx.calendarGroupFilter).toBe('g2');
	});

	it('keeps Calendar operations a viewer may not use off the row and out of More', async () => {
		mutableAvailabilityStore.loading = false;
		const { layOut } = stubToolbarWidths();
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await layOut(1);

		expect(screen.queryByRole('button', { name: 'Bulk Status' })).toBeNull();
		const menu = await openMore();
		expect(within(menu).getByRole('menuitem', { name: 'Reports' })).toBeTruthy();
		expect(within(menu).queryByRole('menuitem', { name: 'Planning' })).toBeNull();
		expect(within(menu).queryByRole('menuitem', { name: 'Settings' })).toBeNull();
		expect(within(menu).queryByRole('menuitem', { name: 'Bulk Status' })).toBeNull();
	});

	it('keeps display toggles and exports in More while the row has room', async () => {
		mutableAvailabilityStore.loading = false;
		const { layOut } = stubToolbarWidths();
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await layOut(4000);

		expect(within(toolbar()).getByRole('link', { name: 'Reports' })).toBeTruthy();
		expect(within(toolbar()).queryByRole('button', { name: 'Show Status Text' })).toBeNull();
		const menu = await openMore();
		expect(within(menu).getByRole('menuitem', { name: 'Print / PDF' })).toBeTruthy();
		await fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Show Status Text' }));
		expect(ctx.showStatusText).toBe(true);

		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		const reopened = await openMore();
		expect(
			within(reopened).getByRole('menuitemcheckbox', { name: 'Show Status Text' }).getAttribute('aria-checked')
		).toBe('true');
	});

	it('exports the shown quarter from the toolbar in 3-month view', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 11);
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await showView('3-Month');

		await chooseFromMore('Export to Excel');
		await waitFor(() => expect(exportMocks.exportQuarterToExcel).toHaveBeenCalledTimes(1));
		expect(exportMocks.exportQuarterToExcel.mock.calls[0][0]).toEqual(new Date(2026, 11, 1));

		await chooseFromMore('Print / PDF');
		await waitFor(() => expect(exportMocks.printQuarterCalendar).toHaveBeenCalledTimes(1));
		expect(exportMocks.printQuarterCalendar.mock.calls[0][0]).toEqual(new Date(2026, 11, 1));
		expect(exportMocks.exportMonthToExcel).not.toHaveBeenCalled();
		expect(
			screen.queryByRole('button', { name: 'Excel' }),
			'the long-range footer has no export of its own'
		).toBeNull();
	});

	it('reports no export failure that arrives after the Organization shell ends', async () => {
		mutableAvailabilityStore.loading = false;
		let failExport!: (error: Error) => void;
		exportMocks.exportMonthToExcel.mockImplementationOnce(
			() => new Promise((_resolve, reject) => (failExport = reject))
		);
		const toastError = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		await chooseFromMore('Export to Excel');
		await waitFor(() => expect(exportMocks.exportMonthToExcel).toHaveBeenCalledTimes(1));
		endOrganizationLifetime();
		failExport(new Error('Workbook failed'));
		await Promise.resolve();
		await tick();

		expect(toastError).not.toHaveBeenCalled();
	});
});
