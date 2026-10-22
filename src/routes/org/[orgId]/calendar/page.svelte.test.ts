// @vitest-environment happy-dom
import { createRawSnippet, getAllContexts, mount, unmount, untrack } from 'svelte';
import { AccountPreferencesProvider } from '$features/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import {
	calendarStore,
	CALENDAR_ANCHOR_COOKIE,
	type CalendarRangeData,
	type CalendarWorkspaceResult
} from '$features/calendar';
import { createReadyAppShellRouteData } from '../appShell.test-support';

const { exportMonthToExcelMock, loadCalendarRangeMock, mergeCalendarRangeIntoStoresMock } = vi.hoisted(() => ({
	exportMonthToExcelMock: vi.fn(),
	loadCalendarRangeMock: vi.fn(),
	mergeCalendarRangeIntoStoresMock: vi.fn()
}));

vi.mock('$features/calendar/utils/calendarExport', () => ({
	exportMonthToExcel: exportMonthToExcelMock
}));

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
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
			reports: 'configure'
		},
		hasCapability: vi.fn(() => true),
		affordanceForFeatureAction: vi.fn(() => ({ allowed: true, visible: true, disabled: false })),
		canAccessFeature: vi.fn(() => true)
	})
}));

vi.mock('$features/calendar/utils/calendarRangeLoader', () => ({
	beginCalendarRangeRead: () => ({ close: () => {} }),
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

vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	groupsStore: { items: [], loading: false, names: [] },
	pinnedGroupsStore: { list: [] }
}));

import Page from './+page.svelte';

function makeBootstrap(range = { rangeStart: '2026-01-01', rangeEnd: '2026-05-31' }): CalendarWorkspaceResult {
	return {
		laneKey: 'calendar',
		data: {
			...range,
			availabilityRange: range,
			availabilityEntries: [],
			specialDays: [],
			specialDaysRange: { rangeStart: '2025-01-01', rangeEnd: '2028-12-31' },
			assignmentTypes: [],
			dailyAssignments: [],
			pinnedGroups: [],
			rankCatalog: [],

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
			confirmedChangesByTab: {},
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'status-types:1', items: [] },
			availabilityEntries: {
				mode: 'range',
				snapshotKey: 'availability:1',
				items: [],
				range
			},
			specialDays: {
				mode: 'range',
				snapshotKey: 'special-days:1',
				items: [],
				range
			},
			calendarAssignments: {
				mode: 'range',
				snapshotKey: 'assignments:1',
				items: { types: [], assignments: [] },
				range
			},
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: [] },
			rankCatalog: { mode: 'replace', snapshotKey: 'rank-catalog', items: [] }
		}
	};
}

const WithPreferences: typeof Page = (anchor, props) => {
	const shell = untrack(() => props.data.shell);
	if (shell.kind !== 'ready') throw new Error('Test requires admitted shell');
	const children = createRawSnippet(() => {
		const context = getAllContexts();
		return {
			render: () => '<section></section>',
			setup: (target) => {
				const page = mount(Page, { target, props, context });
				return () => {
					void unmount(page);
				};
			}
		};
	});
	AccountPreferencesProvider(anchor, {
		userId: shell.user.id,
		orgId: shell.org.id,
		preferences: shell.preferences,
		children
	});
	return {};
};

function makePageData(range?: { rangeStart: string; rangeEnd: string }) {
	return {
		...createReadyAppShellRouteData({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1'
		}),
		calendar: {
			data: makeBootstrap(range)
		}
	};
}

describe('calendar page', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-20T12:00:00'));
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
		vi.useRealTimers();
	});

	it('settles on nothing when the streamed workspace rejects, leaving the load error to the Calendar layout', async () => {
		const rejected = Promise.reject(new Error('availability failed'));
		rejected.catch(() => {});

		const view = render(WithPreferences, {
			props: { data: { ...makePageData(), calendar: { data: rejected } } }
		});
		expect(screen.getByRole('status').hasAttribute('aria-busy')).toBe(false);
		await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

		expect(view.container.textContent).toBe('');
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

		render(WithPreferences, {
			props: {
				data: makePageData()
			}
		});

		calendarStore.goToMonth(2026, 5);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByRole('toolbar', { name: 'Calendar controls' })).toBeTruthy();
		expect(screen.getByRole('status')).toBeTruthy();

		resolveRange?.({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-06-30',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});

		await waitFor(() => {
			expect(screen.queryByRole('status')).toBeNull();
		});
		expect(screen.getByRole('toolbar', { name: 'Calendar controls' })).toBeTruthy();
	});

	it('persists the navigated quarter for the next server bootstrap', async () => {
		calendarStore.goToMonth(2026, 2);
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=; Max-Age=0; Path=/`;
		render(WithPreferences, { props: { data: makePageData({ rangeStart: '2025-12-01', rangeEnd: '2026-05-31' }) } });

		await fireEvent.click(
			within(screen.getByRole('group', { name: 'Calendar view' })).getByRole('radio', { name: '3-Month' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Next 3 months' }));

		await waitFor(() => {
			expect(document.cookie).toContain(`${CALENDAR_ANCHOR_COOKIE}=2026-06-01`);
		});
	});

	it('keeps the calendar visible when range loading fails and retries only on demand', async () => {
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-06-30',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});

		render(WithPreferences, {
			props: {
				data: makePageData()
			}
		});

		calendarStore.goToMonth(2026, 5);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByRole('toolbar', { name: 'Calendar controls' })).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByRole('status').textContent).toContain('Additional calendar data is temporarily unavailable.');
		});

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Retry calendar load' }));

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenNthCalledWith(2, 'org-1', {
				rangeStart: '2026-06-01',
				rangeEnd: '2026-06-30',
				collections: ['availability', 'assignments']
			});
			expect(screen.queryByText('Additional calendar data is temporarily unavailable.')).toBeNull();
		});
	});

	it('stores the month the viewer moves to as the anchor for the next server bootstrap', async () => {
		document.cookie = `${CALENDAR_ANCHOR_COOKIE}=; Max-Age=0; Path=/`;

		render(WithPreferences, {
			props: {
				data: makePageData()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

		await waitFor(() => {
			expect(document.cookie).toContain(`${CALENDAR_ANCHOR_COOKIE}=2026-05-01`);
		});

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(document.cookie).toContain(`${CALENDAR_ANCHOR_COOKIE}=2026-08-01`);
		});
	});
});
