// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Layout from './+layout.svelte';
import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
import {
	calendarAvailabilitySource,
	calendarAssignmentsSource,
	type CalendarRangeData,
	type CalendarWorkspaceResult
} from '$features/calendar';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function range(month: '10' | '12'): Required<CalendarRangeData> {
	const date = `2026-${month}-15`;
	return {
		rangeStart: `2026-${month}-01`,
		rangeEnd: `2026-${month}-31`,
		availabilityEntries: [
			{ id: `availability-${month}`, personnelId: 'p1', statusTypeId: 'leave', startDate: date, endDate: date }
		],
		specialDays: [{ id: `closure-${month}`, name: 'Unit closure', date, type: 'org-closure' }],
		dailyAssignments: [{ id: `assignment-${month}`, date, assignmentTypeId: 'cq', assigneeId: 'p1' }]
	};
}

function workspace() {
	const availability = deferred<Required<CalendarRangeData>['availabilityEntries']>();
	const specialDays = deferred<Required<CalendarRangeData>['specialDays']>();
	const assignments = deferred<{ types: []; assignments: Required<CalendarRangeData>['dailyAssignments'] }>();
	const value: CalendarWorkspaceResult = {
		laneKey: 'calendar',
		data: {
			rangeStart: '2026-10-01',
			rangeEnd: '2026-10-31',
			availabilityRange: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' },
			specialDaysRange: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' },
			personnel: [],
			groups: [],
			statusTypes: [],
			pinnedGroups: [],
			rankCatalog: [],
			assignmentTypes: [],
			activeOnboardingPersonnelIds: [],
			lossWarningWindowDays: 180,
			availabilityEntries: availability.promise,
			specialDays: specialDays.promise,
			dailyAssignments: []
		},
		hydration: {
			orgId: 'org-1',
			confirmedChangesByTab: {},
			personnel: { mode: 'replace', snapshotKey: 'personnel', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'statuses', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pins', items: [] },
			rankCatalog: { mode: 'replace', snapshotKey: 'rank-catalog', items: [] },
			availabilityEntries: {
				mode: 'range',
				snapshotKey: 'october-availability',
				items: availability.promise,
				range: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' }
			},
			specialDays: {
				mode: 'range',
				snapshotKey: 'october-closures',
				items: specialDays.promise,
				range: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' }
			},
			calendarAssignments: {
				mode: 'range',
				snapshotKey: 'october-assignments',
				range: { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' },
				items: assignments.promise
			}
		}
	};
	return {
		value,
		resolveExcept(target?: 'availability' | 'specialDays' | 'assignments') {
			const october = range('10');
			if (target !== 'availability') availability.resolve(october.availabilityEntries);
			if (target !== 'specialDays') specialDays.resolve(october.specialDays);
			if (target !== 'assignments') assignments.resolve({ types: [], assignments: october.dailyAssignments });
		},
		resolve() {
			const october = range('10');
			availability.resolve(october.availabilityEntries);
			specialDays.resolve(october.specialDays);
			assignments.resolve({ types: [], assignments: october.dailyAssignments });
		}
	};
}

afterEach(() => {
	cleanup();
	calendarWorkspaceHydrator.restrict();
	vi.unstubAllGlobals();
});

it.each(['availability', 'specialDays', 'assignments'] as const)(
	'keeps child actions and requests unavailable while the %s bootstrap stream is pending',
	async (target) => {
		const bootstrap = workspace();
		bootstrap.resolveExcept(target);
		const nextRange = range('12');
		const fetchMock = vi.fn(async () => ({ ok: true, json: async () => nextRange }));
		vi.stubGlobal('fetch', fetchMock);
		let rangeLoaded = false;
		const children = createRawSnippet(() => ({
			render: () => '<section>Calendar workspace</section>',
			setup() {
				void fetch('/org/org-1/api/calendar-range?rangeStart=2026-12-01&rangeEnd=2026-12-31').then(() => {
					rangeLoaded = true;
				});
			}
		}));
		render(Layout, { props: { children, data: { calendar: { data: Promise.resolve(bootstrap.value) } } } });
		await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
		expect(screen.queryByText('Calendar workspace')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		bootstrap.resolve();
		await waitFor(() => expect(rangeLoaded).toBe(true));
		expect(screen.getByText('Calendar workspace')).toBeTruthy();
		expect(calendarAvailabilitySource.items.map((item) => item.id)).toEqual(['availability-10']);
		expect(calendarAssignmentsSource.assignments.map((item) => item.id)).toEqual(['assignment-10']);
	}
);

it('does not reopen a denied workspace when its abandoned bootstrap streams resolve', async () => {
	const bootstrap = workspace();
	const children = createRawSnippet(() => ({ render: () => '<section>Calendar workspace</section>' }));
	const { rerender } = render(Layout, {
		props: { children, data: { calendar: { data: Promise.resolve(bootstrap.value) } } }
	});
	await waitFor(() => expect(calendarAvailabilitySource.loading).toBe(true));
	await rerender({
		children,
		data: { calendar: { data: Promise.resolve({ laneKey: 'calendar', access: 'restricted' }) } }
	});
	await waitFor(() => expect(screen.getByRole('heading', { name: 'Access Restricted' })).toBeTruthy());
	bootstrap.resolve();
	await Promise.all([
		bootstrap.value.hydration.availabilityEntries.items,
		bootstrap.value.hydration.specialDays.items,
		bootstrap.value.hydration.calendarAssignments.items
	]);
	await waitFor(() => expect(calendarAvailabilitySource.loading).toBe(false));
	expect(screen.queryByText('Calendar workspace')).toBeNull();
	expect(calendarAvailabilitySource.items).toEqual([]);
	expect(calendarAssignmentsSource.assignments).toEqual([]);
});

it('removes the prior child workspace until replacement streams settle', async () => {
	const first = workspace();
	first.resolve();
	const children = createRawSnippet(() => ({ render: () => '<section>Calendar workspace</section>' }));
	const { rerender } = render(Layout, {
		props: { children, data: { calendar: { data: Promise.resolve(first.value) } } }
	});
	await waitFor(() => expect(screen.getByText('Calendar workspace')).toBeTruthy());
	const next = workspace();
	await rerender({ children, data: { calendar: { data: Promise.resolve(next.value) } } });
	expect(screen.queryByText('Calendar workspace')).toBeNull();
	expect(screen.getByRole('status')).toBeTruthy();
	next.resolve();
	await waitFor(() => expect(screen.getByText('Calendar workspace')).toBeTruthy());
});

it('preserves unsaved child state when page data retains the same workspace', async () => {
	const bootstrap = workspace();
	bootstrap.resolve();
	const data = Promise.resolve(bootstrap.value);
	const children = createRawSnippet(() => ({ render: () => '<input aria-label="Unsaved notes" />' }));
	const { rerender } = render(Layout, { props: { children, data: { calendar: { data } } } });
	await waitFor(() => expect(screen.getByLabelText('Unsaved notes')).toBeTruthy());
	await fireEvent.input(screen.getByLabelText('Unsaved notes'), { target: { value: 'Keep this draft' } });
	await rerender({ children, data: { calendar: { data }, pageResult: 'Updated report' } });
	expect((screen.getByLabelText('Unsaved notes') as HTMLInputElement).value).toBe('Keep this draft');
});
