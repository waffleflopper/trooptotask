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
vi.mock('$features/calendar/utils/calendarPrint', () => exportMocks);
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
	calendarStore.goToMonth(new Date().getFullYear(), new Date().getMonth());
});

function resizeGrip(bar: HTMLElement, edge: 'start' | 'end'): HTMLElement | null {
	return bar.parentElement!.querySelector<HTMLElement>(`[data-edge="${edge}"]`);
}

function toolbar(): HTMLElement {
	return screen.getByRole('toolbar', { name: 'Calendar controls' });
}

async function showView(name: 'Month' | '3-Month'): Promise<void> {
	await fireEvent.click(within(screen.getByRole('group', { name: 'Calendar view' })).getByRole('radio', { name }));
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
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		expect(screen.getByRole('button', { name: /January 2027/ })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
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

	describe('legend', () => {
		const mutableStatusTypes = statusTypesStore as unknown as { items: unknown[] };
		const mutableAssignmentTypes = dailyAssignmentsStore as unknown as { types: unknown[] };

		function renderWithLegendData(role: 'admin' | 'member') {
			mutableAvailabilityStore.loading = false;
			mutableStatusTypes.items = [
				{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }
			];
			mutableAssignmentTypes.types = [
				{
					id: 'sd',
					name: 'Staff Duty',
					shortName: 'SD',
					assignTo: 'personnel',
					color: '#2563eb',
					poolRules: null,
					weekendMode: 'same',
					excusals: [],
					showOnCalendar: false,
					sortOrder: 0
				}
			];
			const ctx = makeContext(mockData, makeMockOrg({ userRole: role }));
			render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
			return within(screen.getByRole('group', { name: 'Calendar legend' }));
		}

		afterEach(() => {
			mutableStatusTypes.items = [];
			mutableAssignmentTypes.types = [];
		});

		it('explains statuses, duty markers and drag-to-add in Month, and only statuses in 3-Month', async () => {
			const legend = renderWithLegendData('admin');

			expect(within(legend.getByRole('list', { name: 'Statuses' })).getByText('Leave')).toBeTruthy();
			expect(within(legend.getByRole('list', { name: 'Duty markers' })).getByText('Duty (SD)')).toBeTruthy();
			expect(legend.getByText('Drag across days to add')).toBeTruthy();

			await showView('3-Month');
			const quarterLegend = within(screen.getByRole('group', { name: 'Calendar legend' }));

			expect(within(quarterLegend.getByRole('list', { name: 'Statuses' })).getByText('Leave')).toBeTruthy();
			expect(quarterLegend.queryByRole('list', { name: 'Duty markers' })).toBeNull();
			expect(quarterLegend.queryByText('Drag across days to add')).toBeNull();
		});

		it('offers drag-to-add only to people who can add availability', () => {
			const legend = renderWithLegendData('member');

			expect(legend.getByRole('list', { name: 'Statuses' })).toBeTruthy();
			expect(legend.queryByText('Drag across days to add')).toBeNull();
		});
	});

	describe('open-day Assign actions', () => {
		const mutableAssignmentTypes = dailyAssignmentsStore as unknown as { types: unknown[] };

		afterEach(() => {
			mutableAssignmentTypes.types = [];
		});

		function renderWithDutyLane(rangeStatus: 'loading' | 'ready') {
			mutableAvailabilityStore.loading = false;
			mutableAssignmentTypes.types = [
				{
					id: 'sd',
					name: 'Staff Duty',
					shortName: 'SD',
					assignTo: 'personnel',
					color: '#2563eb',
					poolRules: null,
					weekendMode: 'same',
					excusals: [],
					showOnCalendar: true,
					sortOrder: 0
				}
			];
			const ctx = makeContext(mockData, makeMockOrg({ userRole: 'admin' }));
			render(CalendarPageView, {
				props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' }, rangeStatus }
			});
		}

		it('offers no Assign on an open day while the 90-day duty history is still loading', () => {
			renderWithDutyLane('loading');

			expect(screen.queryAllByRole('button', { name: /^Assign Staff Duty for / })).toEqual([]);
		});

		it('offers Assign on an open day once the duty history has loaded', () => {
			renderWithDutyLane('ready');

			expect(screen.getAllByRole('button', { name: /^Assign Staff Duty for / }).length).toBeGreaterThan(0);
		});
	});

	it('keeps quarter arrows and picker on the Calendar-owned month across a year boundary', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 11);
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		await showView('3-Month');
		await fireEvent.click(screen.getByRole('button', { name: 'Next 3 months' }));
		await showView('Month');
		expect(screen.getByRole('button', { name: /March 2027/ })).toBeTruthy();
		await showView('3-Month');
		await fireEvent.click(screen.getByRole('button', { name: 'Previous 3 months' }));
		await showView('Month');
		expect(screen.getByRole('button', { name: /December 2026/ })).toBeTruthy();
		await showView('3-Month');
		await fireEvent.click(screen.getByTestId('long-range-date-label'));
		await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Jan' }));
		await showView('Month');
		expect(screen.getByRole('button', { name: /January 2027/ })).toBeTruthy();
	});

	it('opens a bar in place and hands it to the editor from Edit details', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 9);
		const stores = { availability: availabilityStore, statusTypes: statusTypesStore } as unknown as {
			availability: { items: unknown[] };
			statusTypes: { items: unknown[] };
		};
		stores.statusTypes.items = [
			{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }
		];
		stores.availability.items = [
			{
				id: 'entry-1',
				personnelId: 'p1',
				statusTypeId: 'leave',
				startDate: '2026-10-20',
				endDate: '2026-10-23',
				note: null
			}
		];
		try {
			const data = { ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel };
			const ctx = makeContext(data, makeMockOrg({ userRole: 'admin' }));
			render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

			const bar = screen.getByRole('button', { name: 'SGT Smith, Alice, Leave, 20 to 23 October 2026, 4 days' });
			expect(bar.getAttribute('aria-expanded')).toBe('false');
			await fireEvent.click(bar);
			const popover = await screen.findByRole('dialog', { name: 'Leave, SGT Smith' });
			expect(bar.getAttribute('aria-expanded')).toBe('true');
			await fireEvent.click(within(popover).getByRole('button', { name: 'Edit details' }));

			expect(await screen.findByRole('dialog', { name: 'Set Personnel Status' })).toBeTruthy();
			expect(screen.queryByRole('dialog', { name: 'Leave, SGT Smith' })).toBeNull();
			expect(bar.getAttribute('aria-expanded')).toBe('false');
		} finally {
			stores.statusTypes.items = [];
			stores.availability.items = [];
		}
	});

	it('keeps the open popover as it is when its bar is clicked again', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 9);
		const stores = { availability: availabilityStore, statusTypes: statusTypesStore } as unknown as {
			availability: { items: unknown[] };
			statusTypes: { items: unknown[] };
		};
		stores.statusTypes.items = [
			{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }
		];
		stores.availability.items = [
			{
				id: 'entry-1',
				personnelId: 'p1',
				statusTypeId: 'leave',
				startDate: '2026-10-20',
				endDate: '2026-10-23',
				note: null
			}
		];
		try {
			const data = { ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel };
			const ctx = makeContext(data, makeMockOrg({ userRole: 'admin' }));
			render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
			const bar = screen.getByRole('button', { name: 'SGT Smith, Alice, Leave, 20 to 23 October 2026, 4 days' });

			await fireEvent.click(bar);
			await fireEvent.click(
				within(await screen.findByRole('dialog', { name: 'Leave, SGT Smith' })).getByRole('button', { name: 'Remove' })
			);
			await fireEvent.click(bar);
			await tick();

			expect(
				within(screen.getByRole('dialog', { name: 'Leave, SGT Smith' })).getByRole('button', { name: 'Cancel' })
			).toBeTruthy();
		} finally {
			stores.statusTypes.items = [];
			stores.availability.items = [];
		}
	});

	it('gives grips only to an entry opened from its own bar, and edits a hidden one by its dates', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 9);
		const stores = { availability: availabilityStore, statusTypes: statusTypesStore } as unknown as {
			availability: { items: unknown[] };
			statusTypes: { items: unknown[] };
		};
		const entry = (id: string, startDate: string, endDate: string) => ({
			id,
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate,
			endDate,
			note: null
		});
		stores.statusTypes.items = [
			{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }
		];
		stores.availability.items = [
			entry('long', '2026-10-01', '2026-10-08'),
			entry('middle', '2026-10-04', '2026-10-09'),
			entry('short', '2026-10-07', '2026-10-10')
		];
		try {
			const data = { ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel };
			const ctx = makeContext(data, makeMockOrg({ userRole: 'admin' }));
			const save = vi.spyOn(ctx, 'saveAvailability').mockResolvedValue('saved');
			render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

			const long = screen.getByRole('button', { name: 'SGT Smith, Alice, Leave, 1 to 8 October 2026, 8 days' });
			expect(resizeGrip(long, 'end')).toBeNull();
			await fireEvent.click(long);
			await screen.findByRole('dialog', { name: 'Leave, SGT Smith' });
			expect(resizeGrip(long, 'start')).not.toBeNull();
			expect(resizeGrip(long, 'end')).not.toBeNull();
			await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

			await fireEvent.click(
				screen.getByRole('button', { name: 'SGT Smith, Alice, 2 more entries, 4 to 10 October 2026' })
			);
			const overflow = await screen.findByRole('dialog', { name: '2 more entries, SGT Smith' });
			await fireEvent.click(within(overflow).getByRole('button', { name: 'Leave, 7 to 10 October 2026, 4 days' }));
			const hidden = await screen.findByRole('dialog', { name: 'Leave, SGT Smith' });

			expect(document.querySelector('[data-edge]')).toBeNull();
			await fireEvent.click(within(hidden).getByRole('button', { name: 'Edit details' }));
			const editor = await screen.findByRole('dialog', { name: 'Set Personnel Status' });
			await fireEvent.click(within(editor).getByRole('button', { name: 'Update Status' }));

			expect(save.mock.calls).toEqual([
				[
					{
						kind: 'update',
						entry: entry('short', '2026-10-07', '2026-10-10'),
						changes: { statusTypeId: 'leave', startDate: '2026-10-07', endDate: '2026-10-10', note: null }
					}
				]
			]);
		} finally {
			stores.statusTypes.items = [];
			stores.availability.items = [];
		}
	});

	it('keeps the editor open and locked until its save settles', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 9);
		const stores = { availability: availabilityStore, statusTypes: statusTypesStore } as unknown as {
			availability: { items: unknown[]; add?: unknown };
			statusTypes: { items: unknown[] };
		};
		stores.statusTypes.items = [
			{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }
		];
		let finish!: (entry: unknown) => void;
		stores.availability.add = vi.fn(() => new Promise((resolve) => (finish = resolve)));
		try {
			const data = { ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel };
			const ctx = makeContext(data, makeMockOrg({ userRole: 'admin' }));
			render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

			await fireEvent.click(screen.getByRole('button', { name: 'SGT Smith, Alice, Wednesday, October 21, 2026' }));
			const editor = await screen.findByRole('dialog', { name: 'Set Personnel Status' });
			await fireEvent.click(within(editor).getByRole('button', { name: 'Add Status' }));
			expect(within(editor).getByRole('button', { name: 'Add Status' })).toHaveProperty('disabled', true);
			await fireEvent.keyDown(editor, { key: 'Escape' });
			await tick();
			expect(screen.queryByRole('dialog', { name: 'Set Personnel Status' })).not.toBeNull();

			finish({
				id: 'entry-1',
				personnelId: 'p1',
				statusTypeId: 'leave',
				startDate: '2026-10-21',
				endDate: '2026-10-21',
				note: null
			});
			await waitFor(() =>
				expect(within(editor).getByRole('button', { name: 'Add Status' })).toHaveProperty('disabled', false)
			);
			await fireEvent.keyDown(editor, { key: 'Escape' });

			await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set Personnel Status' })).toBeNull());
		} finally {
			stores.statusTypes.items = [];
			delete stores.availability.add;
		}
	});

	it('saves the dragged days with the status whose number is pressed', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 9);
		const statusTypes = statusTypesStore as unknown as { items: unknown[] };
		statusTypes.items = [
			{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }
		];
		const rect = vi
			.spyOn(Element.prototype, 'getBoundingClientRect')
			.mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 310, height: 36 }));
		try {
			const data = { ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel };
			const ctx = makeContext(data, makeMockOrg({ userRole: 'admin' }));
			const save = vi.spyOn(ctx, 'saveAvailability').mockResolvedValue('saved');
			render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

			const pointer = { button: 0, pointerId: 1, pointerType: 'mouse' };
			await fireEvent.pointerDown(
				screen.getByRole('button', { name: 'SGT Smith, Alice, Wednesday, October 21, 2026' }),
				{ ...pointer, clientX: 205 }
			);
			await fireEvent.pointerMove(window, { ...pointer, clientX: 275 });
			await fireEvent.pointerUp(window, { ...pointer, clientX: 275 });
			await fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Add status, Wed 21 – Wed 28 Oct' }), {
				key: '1'
			});

			expect(save.mock.calls).toEqual([
				[
					{
						kind: 'create',
						record: {
							personnelId: 'p1',
							statusTypeId: 'leave',
							startDate: '2026-10-21',
							endDate: '2026-10-28',
							note: null
						}
					}
				]
			]);
			expect(screen.queryByRole('dialog')).toBeNull();
		} finally {
			rect.mockRestore();
			statusTypes.items = [];
		}
	});

	it('moves the end of an opened bar to the day it is dragged to', async () => {
		mutableAvailabilityStore.loading = false;
		calendarStore.goToMonth(2026, 9);
		const stores = { availability: availabilityStore, statusTypes: statusTypesStore } as unknown as {
			availability: { items: unknown[] };
			statusTypes: { items: unknown[] };
		};
		const leave = {
			id: 'entry-1',
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate: '2026-10-20',
			endDate: '2026-10-23',
			note: null
		};
		stores.statusTypes.items = [
			{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }
		];
		stores.availability.items = [leave];
		const rect = vi
			.spyOn(Element.prototype, 'getBoundingClientRect')
			.mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 310, height: 36 }));
		try {
			const data = { ...mockData, personnel: filterPersonnel, allPersonnel: filterPersonnel };
			const ctx = makeContext(data, makeMockOrg({ userRole: 'admin' }));
			const save = vi.spyOn(ctx, 'saveAvailability').mockResolvedValue('saved');
			render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

			const bar = screen.getByRole('button', { name: 'SGT Smith, Alice, Leave, 20 to 23 October 2026, 4 days' });
			await fireEvent.click(bar);
			await screen.findByRole('dialog', { name: 'Leave, SGT Smith' });
			const pointer = { button: 0, pointerId: 1, pointerType: 'mouse' };
			await fireEvent.pointerDown(resizeGrip(bar, 'end')!, { ...pointer, clientX: 225 });
			await fireEvent.pointerMove(window, { ...pointer, clientX: 255 });
			await fireEvent.pointerUp(window, { ...pointer, clientX: 255 });

			expect(save.mock.calls).toEqual([
				[
					{
						kind: 'update',
						entry: leave,
						changes: { statusTypeId: 'leave', startDate: '2026-10-20', endDate: '2026-10-26', note: null }
					}
				]
			]);
		} finally {
			rect.mockRestore();
			stores.statusTypes.items = [];
			stores.availability.items = [];
		}
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

	it('marks the shown calendar view as checked', async () => {
		mutableAvailabilityStore.loading = false;
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });

		const view = screen.getByRole('group', { name: 'Calendar view' });
		expect(within(view).getByRole('radio', { name: 'Month' }).getAttribute('aria-checked')).toBe('true');
		await showView('3-Month');
		expect(within(view).getByRole('radio', { name: '3-Month' }).getAttribute('aria-checked')).toBe('true');
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
		expect(within(menu).getByRole('menuitem', { name: 'Group, Group: All' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Duty planner' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Reports' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Display' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toBeTruthy();
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Export to Excel' }));
		await waitFor(() => expect(exportMocks.exportMonthToExcel).toHaveBeenCalledTimes(1));
		expect(exportMocks.exportMonthToExcel.mock.calls[0].slice(0, 2)).toEqual([2026, 11]);
	});

	it('sends Duty planner, Reports and Settings to their Calendar routes from the row and from More', async () => {
		mutableAvailabilityStore.loading = false;
		const { layOut } = stubToolbarWidths();
		const ctx = makeContext(mockData, makeMockOrg({ userRole: 'owner' }));
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await layOut(4000);

		expect(within(toolbar()).getByRole('link', { name: 'Duty planner' }).getAttribute('href')).toBe(
			'/org/org1/calendar/assignments'
		);
		expect(within(toolbar()).getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe(
			'/org/org1/calendar/reports'
		);
		expect(within(toolbar()).queryByRole('link', { name: 'Settings' }), 'Settings is menu-only').toBeNull();
		await layOut(1);

		await chooseFromMore('Duty planner');
		await chooseFromMore('Reports');
		await chooseFromMore('Settings');

		expect(gotoMock.mock.calls.map(([href]) => href)).toEqual([
			'/org/org1/calendar/assignments',
			'/org/org1/calendar/reports',
			'/org/org1/calendar/settings'
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
		expect(within(menu).queryByRole('menuitem', { name: 'Duty planner' })).toBeNull();
		expect(within(menu).queryByRole('menuitem', { name: 'Settings' })).toBeNull();
		expect(within(menu).queryByRole('menuitem', { name: 'Bulk Status' })).toBeNull();
	});

	it('keeps display toggles in Display and exports in More while the row has room', async () => {
		mutableAvailabilityStore.loading = false;
		const { layOut } = stubToolbarWidths();
		const ctx = makeContext(mockData, makeMockOrg());
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await layOut(4000);

		const more = await openMore();
		expect(within(more).getByRole('menuitem', { name: 'Print / PDF' })).toBeTruthy();
		expect(within(more).queryByRole('menuitemcheckbox', { name: 'Show Status Text' })).toBeNull();
		await fireEvent.keyDown(more, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

		const display = within(toolbar()).getByRole('button', { name: 'Display' });
		display.focus();
		await fireEvent.keyDown(display, { key: 'Enter' });
		await fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Show Status Text' }));
		expect(ctx.showStatusText).toBe(true);
		expect(screen.getByRole('menuitemcheckbox', { name: 'Show Status Text' }).getAttribute('aria-checked')).toBe(
			'true'
		);
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
