// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import CalendarPageView from './CalendarPageView.svelte';
import { CalendarPageContext, type CalendarPageData } from '../contexts/CalendarPageContext.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { calendarStore } from '../stores/calendar.svelte';
import { groupsStore } from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import { CALENDAR_DATE_LABEL } from '../utils/calendarRenderState';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

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
	statusTypesStore: {
		items: [] as Array<{ archivedAt?: string | null }>,
		get active() {
			return this.items.filter((type) => !type.archivedAt);
		},
		loading: false,
		load: vi.fn()
	}
}));
vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	groupsStore: { items: [], loading: false, orgId: 'org1' }
}));

type Stores = {
	availability: { items: AvailabilityEntry[]; loading: boolean };
	assignments: { assignments: DailyAssignment[]; types: AssignmentType[] };
	specialDays: { items: unknown[] };
	statusTypes: { items: unknown[] };
	groups: { items: unknown[] };
};
const stores = {
	availability: availabilityStore,
	assignments: dailyAssignmentsStore,
	specialDays: specialDaysStore,
	statusTypes: statusTypesStore,
	groups: groupsStore
} as unknown as Stores;

const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const NOVEMBER_FIRST = '2026-11-01';

function person(id: string, lastName: string, groupId: string, groupName: string): Personnel {
	return { id, firstName: 'Pat', lastName, rank: 'SGT', mos: '11B', clinicRole: '', groupId, groupName };
}

const people = [
	person('p1', 'Adams', 'g1', 'Alpha'),
	person('p2', 'Brown', 'g2', 'Bravo'),
	person('p3', 'Cole', 'g1', 'Alpha'),
	person('p4', 'Dunn', 'g3', 'Charlie')
];

function entry(id: string, personnelId: string, statusTypeId: string, startDate: string, endDate: string) {
	return { id, personnelId, statusTypeId, startDate, endDate, note: null } satisfies AvailabilityEntry;
}

const staffDuty: AssignmentType = {
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
};

function fillStores() {
	stores.groups.items = ['g1:Alpha', 'g2:Bravo', 'g3:Charlie'].map((pair, sortOrder) => {
		const [id, name] = pair.split(':');
		return { id, name, sortOrder, parentId: null, depth: 1 };
	});
	stores.statusTypes.items = [
		['leave', 'Leave'],
		['sick', 'Sick'],
		['tdy', 'TDY']
	].map(([id, name], sortOrder) => ({
		id,
		name,
		color: '#16a34a',
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder,
		archivedAt: null
	}));
	stores.availability.items = [
		entry('e-leave', 'p1', 'leave', '2026-11-10', '2026-11-12'),
		entry('e-sick', 'p1', 'sick', '2026-11-11', '2026-11-11'),
		entry('e-tdy', 'p2', 'tdy', '2026-11-14', '2026-11-20'),
		entry('e-cole', 'p3', 'leave', '2026-11-02', '2026-11-10'),
		entry('e-dunn', 'p4', 'leave', '2026-11-09', '2026-11-15'),
		entry('e-next-month', 'p1', 'leave', '2026-12-01', '2026-12-03')
	];
	stores.assignments.types = [staffDuty];
	stores.assignments.assignments = [
		{ id: 'a-cole', date: '2026-11-10', assignmentTypeId: 'sd', assigneeId: 'p3' },
		{ id: 'a-adams', date: '2026-11-11', assignmentTypeId: 'sd', assigneeId: 'p1' },
		{ id: 'a-dunn', date: '2026-11-12', assignmentTypeId: 'sd', assigneeId: 'p4' },
		{ id: 'a-brown-later', date: '2026-11-18', assignmentTypeId: 'sd', assigneeId: 'p2' }
	];
	stores.specialDays.items = [{ id: 'sp1', date: '2026-11-11', name: 'Veterans Day', type: 'federal-holiday' }];
}

beforeEach(() => {
	fillStores();
	calendarStore.goToDay(new Date(2026, 10, 11));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	for (const store of [
		stores.assignments,
		stores.specialDays,
		stores.statusTypes,
		stores.groups,
		stores.availability
	]) {
		for (const key of ['items', 'assignments', 'types'] as const) {
			if (key in store) (store as Record<string, unknown>)[key] = [];
		}
	}
	calendarStore.goToMonth(new Date().getFullYear(), new Date().getMonth());
});

const mockData: CalendarPageData = {
	orgId: 'org1',
	orgName: 'Test Org',
	userId: 'user1',
	personnel: people,
	allPersonnel: people
};

function makeContext(org: ReturnType<typeof makeOrg> = makeOrg()) {
	return new CalendarPageContext(mockData, org, vi.fn(), '2026-11-11');
}

function makeOrg(
	overrides: { scopeSet?: import('$lib/access/memberAccessShape').ScopeSet; level?: 'view' | 'configure' } = {}
) {
	return {
		userId: 'user1',
		...createClientAccess({
			membershipRole: 'admin',
			capabilityMap: createCapabilityMap(overrides.level ?? 'configure'),
			scopeSet: overrides.scopeSet ?? { kind: 'groups', groupIds: ['g1', 'g2'] }
		})
	};
}

type View = 'Agenda' | 'Week' | 'Month';

async function showView(name: View): Promise<void> {
	await fireEvent.click(within(screen.getByRole('group', { name: 'Calendar view' })).getByRole('radio', { name }));
}

const dateKeyByLabel = new Map(WEEK.map((key) => [CALENDAR_DATE_LABEL.format(new Date(`${key}T12:00:00`)), key]));
const dayKey = (first: string, index: number) => fromDayNumber(toDayNumber(first) + index);

interface Shown {
	statuses: string[];
	duties: string[];
	conflicts: string[];
}

const CONFLICT_LABEL = /^(.+?) for (.+?): .*, unavailable: (.+)\. Edit assignments$/;

function conflictsIn(root: ParentNode): string[] {
	return [...root.querySelectorAll<HTMLElement>('button[aria-label*=", unavailable: "]')]
		.map((button) => CONFLICT_LABEL.exec(button.getAttribute('aria-label')!))
		.filter((match) => match !== null)
		.map(([, type, label, reason]) => `${dateKeyByLabel.get(label) ?? label}|${type}|${reason}`);
}

function dutyId(personId: string, day: string, typeName: string): string {
	const found = stores.assignments.assignments.find(
		(assignment) =>
			assignment.assigneeId === personId &&
			assignment.date === day &&
			stores.assignments.types.find((type) => type.id === assignment.assignmentTypeId)?.name === typeName
	);
	return found?.id ?? `no assignment for ${personId} on ${day}`;
}

function fromGrid(first: string): Shown {
	const shown: Shown = { statuses: [], duties: [], conflicts: [] };
	const visibleSlots = new Set<string>();
	for (const row of document.querySelectorAll<HTMLElement>('.calendar-rows [data-person-id]')) {
		const personId = row.dataset.personId!;
		let current: string | null = null;
		for (const item of row.querySelector('[data-slot="bar-track"]')!.children) {
			const [start, end] = (item as HTMLElement).style.gridColumn.split(' / ').map(Number);
			if (item instanceof HTMLButtonElement) {
				if (item.dataset.entryId) current = item.dataset.entryId;
				else if (item.getAttribute('aria-hidden') !== 'true') current = null;
				if (current === null) continue;
				for (let column = start; column < end; column++) {
					const day = dayKey(first, column - 2 + 1);
					if (WEEK.includes(day)) shown.statuses.push(`${personId}|${day}|${current}`);
				}
			} else {
				for (const chip of item.querySelectorAll('button')) {
					const day = dayKey(first, start - 1);
					const typeName = chip.getAttribute('aria-label')!.split(',')[0];
					if (!WEEK.includes(day)) continue;
					shown.duties.push(`${personId}|${day}|${dutyId(personId, day, typeName)}`);
					visibleSlots.add(`${day}|${typeName}`);
				}
			}
		}
	}
	shown.conflicts = conflictsIn(document).filter((conflict) => {
		const [day, typeName] = conflict.split('|');
		return visibleSlots.has(`${day}|${typeName}`);
	});
	return normalize(shown);
}

function fromAgenda(): Shown {
	const shown: Shown = { statuses: [], duties: [], conflicts: [] };
	for (const dayItem of document.querySelectorAll<HTMLElement>('[data-testid="calendar-agenda"] li[data-date]')) {
		const day = dayItem.dataset.date!;
		for (const personItem of dayItem.querySelectorAll<HTMLElement>('li[data-person-id]')) {
			const personId = personItem.dataset.personId!;
			for (const status of personItem.querySelectorAll<HTMLElement>('[data-entry-id]')) {
				shown.statuses.push(`${personId}|${day}|${status.dataset.entryId}`);
			}
			for (const duty of personItem.querySelectorAll<HTMLElement>('[data-assignment-id]')) {
				shown.duties.push(`${personId}|${day}|${duty.dataset.assignmentId}`);
			}
		}
		shown.conflicts.push(...conflictsIn(dayItem));
	}
	return normalize(shown);
}

function normalize(shown: Shown): Shown {
	return {
		statuses: shown.statuses.sort(),
		duties: shown.duties.sort(),
		conflicts: shown.conflicts.sort()
	};
}

function availableByDay(): string[] {
	return [...document.querySelectorAll<HTMLElement>('[data-testid="calendar-agenda"] li[data-date]')].map(
		(item) => `${item.dataset.date}:${/(\d+) available/.exec(item.textContent!)![1]}`
	);
}

const ALL_GROUPS: Shown = {
	statuses: [
		'p1|2026-11-10|e-leave',
		'p1|2026-11-11|e-leave',
		'p1|2026-11-11|e-sick',
		'p1|2026-11-12|e-leave',
		'p2|2026-11-14|e-tdy',
		'p2|2026-11-15|e-tdy',
		'p3|2026-11-09|e-cole',
		'p3|2026-11-10|e-cole'
	],
	duties: ['p1|2026-11-11|a-adams', 'p3|2026-11-10|a-cole'],
	conflicts: ['2026-11-10|Staff Duty|Leave 2–10 Nov', '2026-11-11|Staff Duty|Leave 10–12 Nov; Sick 11 Nov']
};

const BRAVO_ONLY: Shown = {
	statuses: ['p2|2026-11-14|e-tdy', 'p2|2026-11-15|e-tdy'],
	duties: [],
	conflicts: []
};

describe('Calendar views over one week', () => {
	async function renderAt(view: View, ctx = makeContext()) {
		render(CalendarPageView, { props: { ctx, data: { orgId: 'org1', orgName: 'Test Org' } } });
		await showView(view);
		return ctx;
	}

	async function shownIn(view: View): Promise<Shown> {
		await showView(view);
		await tick();
		return view === 'Agenda' ? fromAgenda() : fromGrid(view === 'Week' ? WEEK[0] : NOVEMBER_FIRST);
	}

	it('shows the Month grid’s statuses, duties and duty conflicts for the week in Week and in Agenda', async () => {
		await renderAt('Month');

		const month = await shownIn('Month');
		expect(month).toEqual(ALL_GROUPS);
		expect(await shownIn('Week')).toEqual(month);
		expect(await shownIn('Agenda')).toEqual(month);
	});

	it('follows a picked Group in all three views the same way', async () => {
		const ctx = await renderAt('Month');
		ctx.setCalendarGroupFilter('g2');
		await tick();

		const month = await shownIn('Month');
		expect(month).toEqual(BRAVO_ONLY);
		expect(await shownIn('Week')).toEqual(month);
		expect(await shownIn('Agenda')).toEqual(month);
	});

	it('never shows someone outside the reader’s scope, though the data holds their entry and duty', async () => {
		await renderAt('Agenda');

		const agenda = fromAgenda();

		expect(agenda.statuses.some((status) => status.startsWith('p4|'))).toBe(false);
		expect(agenda.duties.some((duty) => duty.startsWith('p4|'))).toBe(false);
		expect(stores.availability.items.some((item) => item.personnelId === 'p4')).toBe(true);
	});

	it('counts who is available each day from the people it lists', async () => {
		const ctx = await renderAt('Agenda');

		expect(availableByDay()).toEqual([
			'2026-11-09:2',
			'2026-11-10:1',
			'2026-11-11:2',
			'2026-11-12:2',
			'2026-11-13:3',
			'2026-11-14:2',
			'2026-11-15:2'
		]);

		ctx.setCalendarGroupFilter('g1');
		await tick();
		expect(availableByDay()).toEqual([
			'2026-11-09:1',
			'2026-11-10:0',
			'2026-11-11:1',
			'2026-11-12:1',
			'2026-11-13:2',
			'2026-11-14:2',
			'2026-11-15:2'
		]);
	});

	it('names a Special Day on its date and says so when no one is out or on duty', async () => {
		await renderAt('Agenda');

		const veterans = document.querySelector<HTMLElement>('li[data-date="2026-11-11"]')!;
		const quiet = document.querySelector<HTMLElement>('li[data-date="2026-11-13"]')!;

		expect(within(veterans).getByText('Veterans Day')).toBeTruthy();
		expect(within(quiet).getByText('No one out or on duty.')).toBeTruthy();
		expect(within(quiet).queryByText('Veterans Day')).toBeNull();
	});

	it('opens the entry popover from an Agenda status and the Daily Assignments editor from a duty for an assignment manager', async () => {
		const ctx = await renderAt('Agenda');

		const status = document.querySelector<HTMLButtonElement>('li[data-date="2026-11-14"] [data-entry-id="e-tdy"]')!;
		await fireEvent.click(status);
		expect(ctx.popover).toMatchObject({ kind: 'entry', entryId: 'e-tdy', person: { id: 'p2' } });

		const duty = document.querySelector<HTMLButtonElement>('li[data-date="2026-11-10"] [data-assignment-id="a-cole"]')!;
		await fireEvent.click(duty);
		expect(ctx.assignmentDate).toEqual(new Date(2026, 10, 10));
	});

	it('offers no duty action in Agenda to someone who cannot manage assignments', async () => {
		await renderAt('Agenda', makeContext(makeOrg({ level: 'view' })));

		const duty = document.querySelector('[data-assignment-id="a-cole"]')!;

		expect(duty).toBeTruthy();
		expect(duty.closest('button')).toBeNull();
	});

	it('shows the same empty state as the grid when the roster is empty', async () => {
		const ctx = new CalendarPageContext(
			{ ...mockData, personnel: [], allPersonnel: [] },
			makeOrg(),
			vi.fn(),
			'2026-11-11'
		);
		await renderAt('Agenda', ctx);

		expect(screen.getByText('No personnel added yet')).toBeTruthy();
		expect(document.querySelector('[data-testid="calendar-agenda"]')).toBeNull();
	});

	describe.each<View>(['Week', 'Agenda'])('%s while its dates are read', (view) => {
		const body = () =>
			view === 'Week'
				? document.querySelector('[data-testid="calendar-week-skeleton"]')
				: document.querySelector('[data-testid="calendar-agenda-skeleton"]');
		const content = () =>
			view === 'Week'
				? document.querySelector('.calendar-rows')
				: document.querySelector('[data-testid="calendar-agenda"]');

		function renderWith(rangeStatus: 'loading' | 'error', onRetryRange = vi.fn()) {
			render(CalendarPageView, {
				props: { ctx: makeContext(), data: { orgId: 'org1', orgName: 'Test Org' }, rangeStatus, onRetryRange }
			});
			return onRetryRange;
		}

		it('shows its skeleton in place of the body', async () => {
			renderWith('loading');
			await showView(view);

			expect(body()).toBeTruthy();
			expect(content()).toBeNull();
		});

		it('shows the load error with a retry in place of the body', async () => {
			const retry = renderWith('error');
			await showView(view);

			expect(content()).toBeNull();
			await fireEvent.click(screen.getByRole('button', { name: 'Retry calendar load' }));
			expect(retry).toHaveBeenCalledTimes(1);
		});
	});

	it('shows a Week or Agenda skeleton instead of an empty body while the stores hydrate', async () => {
		const hydrating = makeContext();
		Object.defineProperty(hydrating, 'isHydrating', { get: () => true });
		render(CalendarPageView, { props: { ctx: hydrating, data: { orgId: 'org1', orgName: 'Test Org' } } });
		hydrating.setViewMode('week');
		await tick();
		expect(document.querySelector('[data-testid="calendar-week-skeleton"]')).toBeTruthy();
		hydrating.setViewMode('agenda');
		await tick();
		expect(document.querySelector('[data-testid="calendar-agenda-skeleton"]')).toBeTruthy();
	});
});
