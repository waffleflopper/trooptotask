// @vitest-environment happy-dom
import { createRawSnippet, getAllContexts, mount, unmount, untrack } from 'svelte';
import AccountPreferencesProvider from '$features/identity/AccountPreferencesProvider.svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import {
	calendarStore,
	CALENDAR_ANCHOR_COOKIE,
	type CalendarRangeData,
	type CalendarWorkspaceResult
} from '$features/calendar';
import type { FeatureKey } from '$lib/access/featureSwitches';
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
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: [] }
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

const EVENTS_OFF: FeatureKey[] = ['eventsAndTaskings'];

function makePageData(range?: { rangeStart: string; rangeEnd: string }, disabledFeatures: FeatureKey[] = EVENTS_OFF) {
	return {
		...createReadyAppShellRouteData({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			disabledFeatures
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

	describe('with Events & Taskings on', () => {
		const projection = {
			kind: 'loaded' as const,
			events: [
				{
					id: 'e1',
					title: 'Field exercise',
					startsOn: '2026-04-06',
					endsOn: '2026-04-08',
					cancelled: false,
					hasWork: true,
					host: null
				}
			],
			suspenses: [{ taskingId: 't1', title: 'Submit roster', suspenseOn: '2026-04-10', status: 'open' as const }],
			commitments: [
				{
					taskingId: 't1',
					title: 'Submit roster',
					personnelId: 'p1',
					startsOn: '2026-04-06',
					endsOn: '2026-04-09',
					conflicts: false
				}
			],
			facts: {
				taskings: {
					t1: {
						eventRelation: 'execution' as const,
						picked: 1,
						required: 2,
						equipment: { ready: 0, total: 0, returnedQuantity: 0, totalQuantity: 0 },
						conflicts: 0,
						nextDate: '2026-04-06',
						suspenseOn: '2026-04-10',
						status: 'open' as const,
						responsibleGroupId: null
					}
				},
				events: {
					e1: {
						total: 1,
						needAction: 1,
						overdue: 0,
						blocked: 0,
						needPeople: 1,
						fullyStaffedAndReady: 0,
						conflicts: 0
					}
				},
				needAction: 1
			}
		};

		it('reads Events with the visible range and marks them on the matrix', async () => {
			loadCalendarRangeMock.mockResolvedValue({
				rangeStart: '2026-04-01',
				rangeEnd: '2026-04-30',
				projection
			});
			render(WithPreferences, { props: { data: makePageData(undefined, []) } });

			expect(await screen.findByRole('link', { name: /Field exercise/ })).toBeTruthy();
			expect(screen.getByRole('link', { name: /suspense: Submit roster/i })).toBeTruthy();
			expect(screen.getByRole('link', { name: /Tasking: Submit roster/ })).toBeTruthy();
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);
			expect(loadCalendarRangeMock).toHaveBeenCalledWith('org-1', {
				rangeStart: '2026-04-01',
				rangeEnd: '2026-04-30',
				collections: ['events']
			});
		});

		it('opens a quick card from an Event and returns focus to it on Escape', async () => {
			loadCalendarRangeMock.mockResolvedValue({ rangeStart: '2026-04-01', rangeEnd: '2026-04-30', projection });
			render(WithPreferences, { props: { data: makePageData(undefined, []) } });

			const bar = await screen.findByRole('link', { name: /Field exercise/ });
			await fireEvent.click(bar);

			const card = await screen.findByRole('dialog', { name: 'Field exercise' });
			expect(within(card).getByRole('link', { name: 'Open event' }).getAttribute('href')).toBe(
				'/org/org-1/calendar/events/e1'
			);
			await fireEvent.keyDown(card, { key: 'Escape' });

			await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Field exercise' })).toBeNull());
			await waitFor(() => expect(document.activeElement).toBe(bar));
		});

		it('opens a quick card for a suspense with the Tasking it belongs to', async () => {
			loadCalendarRangeMock.mockResolvedValue({ rangeStart: '2026-04-01', rangeEnd: '2026-04-30', projection });
			render(WithPreferences, { props: { data: makePageData(undefined, []) } });

			await fireEvent.click(await screen.findByRole('link', { name: /suspense: Submit roster/i }));

			const card = await screen.findByRole('dialog', { name: 'Submit roster' });
			expect(within(card).getByRole('link', { name: 'Open tasking' }).getAttribute('href')).toBe(
				'/org/org-1/calendar/taskings/t1'
			);
		});

		it('badges Events & Taskings with the Taskings that need action', async () => {
			loadCalendarRangeMock.mockResolvedValue({ rangeStart: '2026-04-01', rangeEnd: '2026-04-30', projection });
			render(WithPreferences, { props: { data: makePageData(undefined, []) } });

			expect(await screen.findByRole('link', { name: /Events & Taskings\W+1 need action/ })).toBeTruthy();
		});

		it('keeps the matrix usable when only the projection fails and retries that read alone', async () => {
			loadCalendarRangeMock.mockResolvedValueOnce({
				rangeStart: '2026-04-01',
				rangeEnd: '2026-04-30',
				projection: { kind: 'failed' }
			});
			loadCalendarRangeMock.mockResolvedValueOnce({ rangeStart: '2026-04-01', rangeEnd: '2026-04-30', projection });
			render(WithPreferences, { props: { data: makePageData(undefined, []) } });

			const retry = await screen.findByRole('button', { name: 'Retry loading Events' });
			expect(screen.queryByText('Additional calendar data is temporarily unavailable.')).toBeNull();
			expect(screen.getAllByRole('button', { name: /Smith, Alice/ }).length).toBeGreaterThan(0);

			await fireEvent.click(retry);

			expect(await screen.findByRole('link', { name: /Field exercise/ })).toBeTruthy();
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(2);
			expect(screen.queryByRole('button', { name: 'Retry loading Events' })).toBeNull();
		});

		it('reads only availability and assignments past the loaded months while the switch is off', async () => {
			render(WithPreferences, { props: { data: makePageData() } });

			const next = await screen.findByRole('button', { name: 'Next month' });
			await fireEvent.click(next);
			await fireEvent.click(next);

			await waitFor(() => expect(loadCalendarRangeMock).toHaveBeenCalled());
			for (const [, request] of loadCalendarRangeMock.mock.calls) {
				expect(request.collections).not.toContain('events');
			}
			expect(screen.queryByRole('group', { name: 'Events' })).toBeNull();
		});
	});
});
