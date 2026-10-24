// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	RosterFillPick,
	RosterFillPreview,
	RosterReplacement,
	RosterSwapOptions
} from '$features/calendar/contracts';
import type { RosterSwapOutcome } from '$features/calendar/stores/dailyAssignments.svelte';
import type { RosterDayRead } from '$features/calendar/contexts/PlannerRosterRead.svelte';
import type { RosterEntry, RosterView } from '$features/calendar/utils/plannerRosters';
import type { Personnel } from '$features/personnel/contracts';
import type { ComponentProps } from 'svelte';
import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';

const staffDuty: AssignmentType = {
	id: 'type-sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#2563eb',
	poolRules: null,
	weekendMode: 'same',
	excusals: [{ personId: 'p-hale', reason: 'Excused', startsOn: '2026-01-01' }],
	showOnCalendar: true,
	sortOrder: 1
};

const person = (id: string, rank: string, lastName: string, firstName: string): Personnel => ({
	id,
	rank,
	lastName,
	firstName,
	mos: '',
	clinicRole: '',
	groupId: null,
	groupName: ''
});

const kim = person('p-kim', 'SGT', 'Kim', 'Jae-won');
const okafor = person('p-okafor', 'SGT', 'Okafor', 'Ife');
const hale = person('p-hale', 'SSG', 'Hale', 'Corey');
const reed = person('p-reed', 'PV2', 'Reed', 'Sam');

function duty(date: string, assignmentTypeId: string, assigneeId: string): DailyAssignment {
	return { id: `${date}-${assignmentTypeId}`, date, assignmentTypeId, assigneeId };
}

afterEach(cleanup);

function renderPlanner(
	props: {
		assignmentTypes?: AssignmentType[];
		assignments?: DailyAssignment[];
		personnel?: Personnel[];
		availabilityEntries?: AvailabilityEntry[];
		rangeStatus?: 'ready' | 'loading' | 'error';
		onSetAssignment?: (date: string, typeId: string, assigneeId: string) => Promise<boolean>;
		onSetAssignmentBatch?: (
			batch: { date: string; assignmentTypeId: string; assigneeId: string }[]
		) => Promise<boolean>;
		onRetry?: () => void;
		rosters?: Partial<NonNullable<ComponentProps<typeof MonthlyAssignmentPlanner>['rosters']>>;
		staleAssignments?: ComponentProps<typeof MonthlyAssignmentPlanner>['staleAssignments'];
	} = {}
) {
	const onSetAssignment = vi.fn(props.onSetAssignment ?? (async () => true));
	const onSetAssignmentBatch = vi.fn(props.onSetAssignmentBatch ?? (async () => true));
	const rosters = props.rosters && {
		da6Href: (typeId: string, month: string) => `/org/acme/calendar/rosters/${typeId}?month=${month}`,
		status: 'ready' as const,
		stale: false,
		views: new Map(),
		onRetry: vi.fn(),
		preview: vi.fn(async () => ({ picks: [], unfilled: [] })),
		fill: vi.fn(async () => 'saved' as const),
		replacement: vi.fn(async (): Promise<RosterReplacement> => {
			throw new Error('No replacement preview');
		}),
		replace: vi.fn(async () => 'saved' as const),
		swapOptions: vi.fn(async (): Promise<RosterSwapOptions> => {
			throw new Error('No swap options');
		}),
		swap: vi.fn(async (): Promise<RosterSwapOutcome> => ({ status: 'saved' })),
		undoSwap: vi.fn(async () => true),
		day: vi.fn(() => undefined),
		loadDay: vi.fn(),
		retryDay: vi.fn(),
		...props.rosters
	};
	const view = render(MonthlyAssignmentPlanner, {
		props: {
			currentDate: new Date(2026, 9, 1),
			rangeStatus: props.rangeStatus ?? 'ready',
			onRetry: props.onRetry ?? vi.fn(),
			assignmentTypes: props.assignmentTypes ?? [staffDuty],
			assignments: props.assignments ?? [],
			availabilityEntries: props.availabilityEntries ?? [],
			statusTypes: [
				{
					id: 'leave',
					name: 'Leave',
					color: '#0a0',
					textColor: '#fff',
					shortLabel: null,
					rosterEffect: 'A',
					sortOrder: 0
				},
				{
					id: 'appt',
					name: 'Appointment',
					color: '#a60',
					textColor: '#fff',
					shortLabel: null,
					rosterEffect: 'available',
					sortOrder: 1
				}
			],
			specialDays: [],
			personnelByGroup: [{ group: 'Alpha', personnel: props.personnel ?? [kim, okafor, hale] }],
			groups: [
				{ id: 'g-alpha', name: 'Alpha', sortOrder: 0 },
				{ id: 'g-bravo', name: 'Bravo', sortOrder: 1 }
			],
			onSetAssignment,
			onSetAssignmentBatch,
			rosters,
			staleAssignments: props.staleAssignments
		}
	});
	return { onSetAssignment, onSetAssignmentBatch, rerender: view.rerender };
}

async function openColumnMenu(typeName = 'Staff Duty') {
	await fireEvent.click(screen.getByRole('button', { name: `${typeName} column actions` }));
	return screen.findByRole('dialog', { name: `Quick fill, ${typeName}` });
}

describe('MonthlyAssignmentPlanner Clear month', () => {
	async function startClear() {
		await openColumnMenu();
		await fireEvent.click(screen.getByRole('button', { name: 'Clear month' }));
		return screen.getByRole('alertdialog');
	}

	it('keeps the confirmation busy until the month clear settles and blocks the column menu meanwhile', async () => {
		let settle!: (saved: boolean) => void;
		const { onSetAssignmentBatch } = renderPlanner({
			onSetAssignmentBatch: () => new Promise<boolean>((resolve) => (settle = resolve))
		});
		const trigger = screen.getByRole('button', { name: 'Staff Duty column actions' }) as HTMLButtonElement;

		const confirmation = await startClear();
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Clear month' }));

		expect(onSetAssignmentBatch).toHaveBeenCalledTimes(1);
		const batch = onSetAssignmentBatch.mock.calls[0][0];
		expect(batch).toHaveLength(31);
		expect(batch[0]).toEqual({ date: '2026-10-01', assignmentTypeId: 'type-sd', assigneeId: '' });
		expect(batch[30]).toEqual({ date: '2026-10-31', assignmentTypeId: 'type-sd', assigneeId: '' });
		expect(screen.getByRole('alertdialog')).toBe(confirmation);
		expect(confirmation.getAttribute('aria-busy')).toBe('true');
		expect(trigger.disabled).toBe(true);

		settle(true);

		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(trigger.disabled).toBe(false);
	});

	it('keeps the confirmation open for a retry when the month clear fails', async () => {
		const { onSetAssignmentBatch } = renderPlanner({
			onSetAssignmentBatch: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
		});

		const confirmation = await startClear();
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Clear month' }));

		await waitFor(() => expect(confirmation.hasAttribute('aria-busy')).toBe(false));
		expect(screen.getByRole('alertdialog')).toBe(confirmation);

		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Clear month' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onSetAssignmentBatch).toHaveBeenCalledTimes(2);
	});
});

describe('MonthlyAssignmentPlanner Quick fill', () => {
	async function chooseAssignee(label: RegExp) {
		const select = screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;
		const option = within(select).getByRole('option', { name: label }) as HTMLOptionElement;
		await fireEvent.change(select, { target: { value: option.value } });
	}

	it('fills only the open weekdays by default and reaches the occupied ones when Only open days is turned off', async () => {
		const { onSetAssignmentBatch } = renderPlanner({
			assignments: [duty('2026-10-01', 'type-sd', 'p-okafor'), duty('2026-10-02', 'type-sd', 'p-okafor')]
		});

		await openColumnMenu();
		await chooseAssignee(/Kim/);
		await fireEvent.click(screen.getByRole('button', { name: 'Fill 20 days' }));

		await waitFor(() => expect(onSetAssignmentBatch).toHaveBeenCalledTimes(1));
		const filled = onSetAssignmentBatch.mock.calls[0][0];
		expect(filled.map((write) => write.date).slice(0, 3)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
		expect(filled.every((write) => write.assigneeId === 'p-kim' && write.assignmentTypeId === 'type-sd')).toBe(true);

		await openColumnMenu();
		await chooseAssignee(/Kim/);
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Only open days' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Fill 22 days' }));

		await waitFor(() => expect(onSetAssignmentBatch).toHaveBeenCalledTimes(2));
		expect(onSetAssignmentBatch.mock.calls[1][0].map((write) => write.date).slice(0, 2)).toEqual([
			'2026-10-01',
			'2026-10-02'
		]);
	});

	it('does not offer a person the duty exempts, and cannot apply until someone is chosen', async () => {
		renderPlanner();

		await openColumnMenu();
		const select = screen.getByRole('combobox', { name: 'Assignee' });

		expect(within(select).queryByRole('option', { name: /Hale/ })).toBeNull();
		expect(within(select).getByRole('option', { name: /Kim/ })).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Fill 22 days' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('cannot apply when every slot it would write is already occupied', async () => {
		const weekendDays = [3, 4, 10, 11, 17, 18, 24, 25, 31];
		renderPlanner({
			assignments: weekendDays.map((day) => duty(`2026-10-${String(day).padStart(2, '0')}`, 'type-sd', 'p-okafor'))
		});

		await openColumnMenu();
		await chooseAssignee(/Kim/);
		await fireEvent.click(screen.getByRole('radio', { name: 'Weekends' }));

		expect((screen.getByRole('button', { name: 'Fill 0 days' }) as HTMLButtonElement).disabled).toBe(true);
	});
});

describe('MonthlyAssignmentPlanner table', () => {
	it('flags a person assigned on a day they are unavailable and replaces them from the Conflicts panel', async () => {
		const { onSetAssignment } = renderPlanner({
			assignments: [duty('2026-10-21', 'type-sd', 'p-okafor')],
			availabilityEntries: [
				{
					id: 'leave-1',
					personnelId: 'p-okafor',
					statusTypeId: 'leave',
					startDate: '2026-10-20',
					endDate: '2026-10-23'
				}
			]
		});

		expect(
			screen.getByRole('button', { name: /Staff Duty, Wed 21 Oct: SGT Okafor, Ife, unavailable: Leave 20–23 Oct/ })
		).toBeTruthy();
		const panel = screen.getByRole('region', { name: 'Conflicts' });

		await fireEvent.click(within(panel).getByRole('button', { name: 'Find replacement for Staff Duty, Wed 21 Oct' }));
		await fireEvent.click(await screen.findByRole('option', { name: /Kim, Jae-won/ }));

		await waitFor(() => expect(onSetAssignment).toHaveBeenCalledWith('2026-10-21', 'type-sd', 'p-kim'));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Staff Duty, Wed 21 Oct: / }));
	});

	it('clears a single slot from its picker, and offers no clear for an open slot', async () => {
		const { onSetAssignment } = renderPlanner({ assignments: [duty('2026-10-06', 'type-sd', 'p-kim')] });

		await fireEvent.click(screen.getByRole('button', { name: 'Assign Staff Duty, Mon 5 Oct' }));
		await screen.findByRole('dialog', { name: 'Staff Duty, Mon 5 Oct' });
		expect(screen.queryByRole('button', { name: 'Clear assignment' })).toBeNull();
		await fireEvent.keyDown(screen.getByRole('combobox', { name: 'Find person' }), { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		await fireEvent.click(screen.getByRole('button', { name: /Staff Duty, Tue 6 Oct: SGT Kim/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Clear assignment' }));

		await waitFor(() => expect(onSetAssignment).toHaveBeenCalledWith('2026-10-06', 'type-sd', ''));
	});

	it('offers no editing until the month has loaded, and retries a failed load', async () => {
		const onRetry = vi.fn();
		renderPlanner({ rangeStatus: 'error', onRetry });

		expect(screen.queryByRole('button', { name: /column actions$/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Assign / })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry calendar load' }));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});

describe('MonthlyAssignmentPlanner roster counts', () => {
	const entry = (personId: string, count: number, effect: RosterEntry['effect'] = null): RosterEntry => ({
		personId,
		count,
		effect
	});

	function staffDutyRoster(overrides: Partial<RosterView> = {}): RosterView {
		const standing = [entry('p-okafor', 12, { code: 'A', reason: 'Leave' }), entry('p-kim', 9), entry('p-moss', 0)];
		return {
			typeId: 'type-sd',
			current: [{ track: 'all', entries: standing }],
			todayAssignee: 'p-moss',
			excused: ['p-hale'],
			covered: new Set(['2026-10-20']),
			conflicts: [],
			swaps: [],
			...overrides
		};
	}

	const moss = person('p-moss', 'SPC', 'Moss', 'Ray');

	function rowTexts(table: HTMLElement) {
		return within(table)
			.getAllByRole('row')
			.slice(1)
			.map((row) => row.textContent!.replace(/\s+/g, ' ').trim());
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it("lists today's counts with A holds by code, today's assignee as Today, and the excused in the footer", () => {
		renderPlanner({
			personnel: [kim, okafor, hale, moss],
			rosters: { views: new Map([['type-sd', staffDutyRoster()]]) }
		});

		const panel = screen.getByRole('region', { name: 'Roster · count today' });
		const table = within(panel).getByRole('table', { name: 'Staff Duty roster' });
		expect(rowTexts(table)).toEqual(['SGT Okafor A 12 12, A: Leave', 'SGT Kim 9', 'SPC Moss Today , count 0']);
		const link = within(panel).getByRole('link', { name: 'Open the DA 6' });
		expect(link.parentElement!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
			'SSG Hale is excused. Open the DA 6 to see every number.'
		);
		expect(link.getAttribute('href')).toBe('/org/acme/calendar/rosters/type-sd?month=2026-10');
	});

	it("links each person-assigned column's menu to its DA 6 for the shown month", async () => {
		const cq: AssignmentType = { ...staffDuty, id: 'type-cq', name: 'Charge of Quarters', shortName: 'CQ' };
		const motorPool: AssignmentType = { ...staffDuty, id: 'type-mp', name: 'Motor Pool', assignTo: 'group' };
		renderPlanner({
			assignmentTypes: [staffDuty, cq, motorPool],
			rosters: { views: new Map([['type-sd', staffDutyRoster()]]) }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Charge of Quarters column actions' }));
		const menu = await screen.findByRole('dialog', { name: 'Quick fill, Charge of Quarters' });
		expect(within(menu).getByRole('link', { name: 'Open the DA 6' }).getAttribute('href')).toBe(
			'/org/acme/calendar/rosters/type-cq?month=2026-10'
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Motor Pool column actions' }));
		const groupMenu = await screen.findByRole('dialog', { name: 'Quick fill, Motor Pool' });
		expect(within(groupMenu).queryByRole('link', { name: 'Open the DA 6' })).toBeNull();
	});

	it('holds the panel in place with a skeleton while counts load, and offers a retry when they fail', async () => {
		const onRetry = vi.fn();
		renderPlanner({ rosters: { status: 'loading' } });

		const panel = screen.getByRole('region', { name: 'Roster · count today' });
		expect(within(panel).getByRole('status', { name: 'Loading roster counts' })).toBeTruthy();
		expect(screen.getAllByRole('button', { name: /^Assign Staff Duty/ }).length).toBeGreaterThan(0);
		cleanup();

		renderPlanner({ rosters: { status: 'error', onRetry } });
		await fireEvent.click(screen.getByRole('button', { name: 'Retry roster counts' }));

		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(screen.getAllByRole('button', { name: /^Assign Staff Duty/ }).length).toBeGreaterThan(0);
	});

	it('opens Fill from roster from a Fill button on each person-assigned column, and offers none on a Group column', async () => {
		const motorPool: AssignmentType = { ...staffDuty, id: 'type-mp', name: 'Motor Pool', assignTo: 'group' };
		renderPlanner({
			assignmentTypes: [staffDuty, motorPool],
			rosters: { views: new Map([['type-sd', staffDutyRoster()]]) }
		});

		expect(screen.queryByRole('button', { name: 'Fill Motor Pool from roster' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Fill Staff Duty from roster' }));
		expect(await screen.findByRole('dialog', { name: 'Fill from roster, Staff Duty' })).toBeTruthy();
	});

	it('shows no counts, no DA 6 link and keeps Quick fill when the operator cannot see the whole Organization', async () => {
		renderPlanner();

		expect(screen.queryByRole('region', { name: 'Roster · count today' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Fill Staff Duty from roster' })).toBeNull();
		const menu = await openColumnMenu();
		expect(screen.queryByRole('button', { name: 'One person instead' })).toBeNull();
		expect(within(menu).queryByRole('link', { name: 'Open the DA 6' })).toBeNull();
	});

	it('flags a hand-assigned person the roster marks D that day', () => {
		renderPlanner({
			assignments: [duty('2026-10-20', 'type-sd', 'p-kim')],
			rosters: {
				views: new Map([
					[
						'type-sd',
						staffDutyRoster({ conflicts: [{ date: '2026-10-20', personId: 'p-kim', code: 'D', reason: 'CQ' }] })
					]
				])
			}
		});

		expect(
			screen.getByRole('button', { name: 'Staff Duty, Tue 20 Oct: SGT Kim, Jae-won, unavailable: CQ (D)' })
		).toBeTruthy();
		expect(
			within(screen.getByRole('region', { name: 'Conflicts' })).getByText('SGT Kim, Jae-won is on CQ (D).')
		).toBeTruthy();
	});

	describe('conflicts against a roster view', () => {
		const savedLeave: AvailabilityEntry = {
			id: 'leave-1',
			personnelId: 'p-okafor',
			statusTypeId: 'leave',
			startDate: '2026-10-20',
			endDate: '2026-10-23'
		};
		const okaforOn21 = /Staff Duty, Wed 21 Oct: SGT Okafor, Ife, unavailable: Leave 20–23 Oct/;
		const coveringView = new Map([['type-sd', staffDutyRoster({ covered: new Set(['2026-10-21']) })]]);

		it('leaves a fresh roster view to judge the days it details', () => {
			renderPlanner({
				assignments: [duty('2026-10-21', 'type-sd', 'p-okafor')],
				availabilityEntries: [savedLeave],
				rosters: { views: coveringView }
			});

			expect(screen.queryByRole('button', { name: okaforOn21 })).toBeNull();
		});

		it('does not flag a Still available status while the roster view is stale', () => {
			renderPlanner({
				assignments: [duty('2026-10-21', 'type-sd', 'p-okafor')],
				availabilityEntries: [{ ...savedLeave, id: 'appt-1', statusTypeId: 'appt' }],
				rosters: { views: coveringView, stale: true }
			});

			expect(screen.queryByRole('button', { name: /Staff Duty, Wed 21 Oct: SGT Okafor, Ife, unavailable/ })).toBeNull();
		});

		it('flags a Leave saved after a roster refresh failed instead of trusting the stale view', () => {
			renderPlanner({
				assignments: [duty('2026-10-21', 'type-sd', 'p-okafor')],
				availabilityEntries: [savedLeave],
				rosters: { views: coveringView, stale: true }
			});

			expect(screen.getByRole('button', { name: okaforOn21 })).toBeTruthy();
			expect(within(screen.getByRole('region', { name: 'Conflicts' })).getByText(/SGT Okafor, Ife/)).toBeTruthy();
		});

		describe.each([
			['stale', { views: coveringView, stale: true }],
			['loading', { views: new Map(), status: 'loading' as const }]
		])('with a %s roster view', (_state, rosters) => {
			it('flags a person holding Staff Duty and CQ on one day with D naming the other duty', () => {
				renderPlanner({
					assignmentTypes: [staffDuty, { ...staffDuty, id: 'type-cq', name: 'CQ', shortName: 'CQ', excusals: [] }],
					assignments: [duty('2026-10-21', 'type-sd', 'p-kim'), duty('2026-10-21', 'type-cq', 'p-kim')],
					rosters
				});

				expect(
					screen.getByRole('button', { name: /Staff Duty, Wed 21 Oct: SGT Kim, Jae-won, unavailable: CQ \(D\)/ })
				).toBeTruthy();
				expect(
					screen.getByRole('button', { name: /CQ, Wed 21 Oct: SGT Kim, Jae-won, unavailable: Staff Duty \(D\)/ })
				).toBeTruthy();
			});
		});
	});

	const detailDay: RosterDayRead = {
		status: 'ready',
		day: {
			track: 'all',
			standing: [
				{ personId: 'p-okafor', count: 12, effect: { code: 'A', reason: 'Leave' } },
				{ personId: 'p-kim', count: 9, effect: null },
				{ personId: 'p-moss', count: 0, effect: null }
			]
		}
	};

	it('reads the roster day when the picker opens, lists the pool by count and finds someone off the roster by name', async () => {
		const loadDay = vi.fn();
		renderPlanner({
			personnel: [kim, okafor, hale, moss, reed],
			rosters: { views: new Map([['type-sd', staffDutyRoster()]]), day: () => detailDay, loadDay }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Assign Staff Duty, Tue 20 Oct' }));
		await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' });

		expect(loadDay).toHaveBeenCalledWith('type-sd', '2026-10-20');

		expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
			'SGT Okafor, Ife, count 12, unavailable: Leave (A)',
			'SGT Kim, Jae-won, count 9',
			'SPC Moss, Ray, count 0'
		]);
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find person' }), { target: { value: 'reed' } });
		expect((await screen.findByRole('option', { name: /Reed, Sam/ })).getAttribute('aria-label')).toBe(
			'PV2 Reed, Sam, not on this roster'
		);
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find person' }), { target: { value: 'hale' } });
		expect(screen.queryByRole('option', { name: /Hale, Corey/ })).toBeNull();
	});

	it('shows the loading line while the roster day loads, and a load error whose Retry reads it again', async () => {
		const openPicker = async (read: RosterDayRead, more: { loadDay?: () => void; retryDay?: () => void } = {}) => {
			renderPlanner({
				personnel: [kim, okafor, hale, moss],
				rosters: { views: new Map([['type-sd', staffDutyRoster()]]), day: () => read, ...more }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Assign Staff Duty, Tue 20 Oct' }));
			return screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' });
		};
		expect(within(await openPicker({ status: 'loading' })).getByRole('status')).toBeTruthy();
		cleanup();

		const loadDay = vi.fn();
		const retryDay = vi.fn();
		const dialog = await openPicker({ status: 'error' }, { loadDay, retryDay });
		expect(within(dialog).getByRole('alert')).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

		expect(retryDay).toHaveBeenCalledWith('type-sd', '2026-10-20');
		expect(loadDay).toHaveBeenCalledTimes(1);
	});

	it('offers no one while a counted roster day loads, so nobody outside the pool is picked early', async () => {
		renderPlanner({
			personnel: [kim, okafor, hale, moss],
			rosters: { views: new Map([['type-sd', staffDutyRoster()]]), day: () => ({ status: 'loading' }) }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Assign Staff Duty, Tue 20 Oct' }));
		const dialog = await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' });

		expect(within(dialog).getByRole('status').textContent).toContain('Loading roster counts');
		expect(within(dialog).queryAllByRole('option')).toEqual([]);
		expect(within(dialog).queryByText('No one matches.')).toBeNull();
	});

	it('reaches anyone not excused by name search only, tagged Count unavailable, when the roster day failed', async () => {
		const retryDay = vi.fn();
		const onSetAssignment = vi.fn(async () => true);
		renderPlanner({
			personnel: [kim, okafor, hale, moss],
			onSetAssignment,
			rosters: { views: new Map([['type-sd', staffDutyRoster()]]), day: () => ({ status: 'error' }), retryDay }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Assign Staff Duty, Tue 20 Oct' }));
		const dialog = await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' });

		expect(within(dialog).getByRole('alert').textContent).toContain('Roster counts could not be loaded.');
		expect(within(dialog).queryAllByRole('option')).toEqual([]);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
		expect(retryDay).toHaveBeenCalledWith('type-sd', '2026-10-20');

		await fireEvent.input(screen.getByRole('combobox', { name: 'Find person' }), { target: { value: 'moss' } });
		const found = await screen.findByRole('option', { name: /Moss, Ray/ });
		expect(found.getAttribute('aria-label')).toBe('SPC Moss, Ray, count unavailable');
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find person' }), { target: { value: 'hale' } });
		expect(screen.queryByRole('option', { name: /Hale, Corey/ })).toBeNull();
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find person' }), { target: { value: 'moss' } });
		await fireEvent.click(await screen.findByRole('option', { name: /Moss, Ray/ }));
		expect(onSetAssignment).toHaveBeenCalledWith('2026-10-20', 'type-sd', 'p-moss');
	});

	it('lists Groups for a Group duty while the roster reads are loading or failed', async () => {
		const groupDuty: AssignmentType = {
			...staffDuty,
			id: 'type-grp',
			name: 'Fatigue',
			assignTo: 'group',
			excusals: []
		};
		for (const status of ['loading', 'error'] as const) {
			renderPlanner({
				assignmentTypes: [groupDuty],
				rosters: { day: () => ({ status }) }
			});
			await fireEvent.click(screen.getAllByRole('button', { name: /^Assign Fatigue/ })[0]);
			const dialog = await screen.findByRole('dialog', { name: /^Fatigue,/ });

			expect(
				within(dialog)
					.getAllByRole('option')
					.map((option) => option.getAttribute('aria-label'))
			).toEqual(['Alpha', 'Bravo']);
			cleanup();
		}
	});

	it('keeps the last roster day listed but offers Retry when a refresh of it failed', async () => {
		const retryDay = vi.fn();
		renderPlanner({
			personnel: [kim, okafor, hale, moss],
			rosters: {
				views: new Map([['type-sd', staffDutyRoster()]]),
				day: () => ({ ...detailDay, stale: true }),
				retryDay
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Assign Staff Duty, Tue 20 Oct' }));
		const dialog = await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' });

		expect(within(dialog).getByRole('alert').textContent).toContain('Roster counts could not be loaded.');
		expect(within(dialog).getAllByRole('option')).toHaveLength(3);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
		expect(retryDay).toHaveBeenCalledWith('type-sd', '2026-10-20');
	});

	it('keeps people outside the pool to a name search on a day the roster does not detail', async () => {
		renderPlanner({
			personnel: [kim, okafor, hale, moss],
			rosters: {
				views: new Map([['type-sd', staffDutyRoster()]]),
				day: () => ({ status: 'ready', day: { track: null, pool: ['p-moss', 'p-kim'] } })
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Assign Staff Duty, Sat 17 Oct' }));
		await screen.findByRole('dialog', { name: 'Staff Duty, Sat 17 Oct' });

		expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
			'SPC Moss, Ray',
			'SGT Kim, Jae-won'
		]);
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find person' }), { target: { value: 'okafor' } });
		expect((await screen.findByRole('option', { name: /Okafor, Ife/ })).getAttribute('aria-label')).toBe(
			'SGT Okafor, Ife, not on this roster'
		);
	});

	it('previews Fill from roster for the open days from tomorrow, writes the previewed picks and closes once they land', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16) });
		const preview = vi.fn(
			async (): Promise<RosterFillPreview> => ({
				picks: [
					{ date: '2026-10-17', personId: 'p-kim', count: 13, passedOver: [], returningFrom: 'TDY' },
					{
						date: '2026-10-18',
						personId: 'p-moss',
						count: 12,
						passedOver: [{ personId: 'p-okafor', count: 12, code: 'A', reason: 'Leave' }],
						returningFrom: null
					}
				],
				unfilled: []
			})
		);
		const manual = duty('2026-10-19', 'type-sd', 'p-kim');
		const fill = vi.fn(async (typeId: string, _from: string, _through: string, picks: RosterFillPick[]) => {
			await planner.rerender({
				assignments: [manual, ...picks.map((pick) => duty(pick.date, typeId, pick.personId))]
			});
			return 'saved' as const;
		});
		const planner = renderPlanner({
			personnel: [kim, okafor, hale, moss],
			assignments: [manual],
			rosters: { views: new Map([['type-sd', staffDutyRoster()]]), preview, fill }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Fill Staff Duty from roster' }));
		const dialog = await screen.findByRole('dialog', { name: 'Fill from roster, Staff Duty' });

		expect(preview).toHaveBeenCalledWith('type-sd', '2026-10-17', '2026-10-31');
		expect(within(dialog).getByText(/^14 open days\./)).toBeTruthy();
		const picks = await within(dialog).findByRole('list', { name: 'Roster picks' });
		expect(
			within(picks)
				.getAllByRole('listitem')
				.map((row) => row.textContent!.replace(/\s+/g, ' ').trim())
		).toEqual([
			'17 Sat SGT Kim back from TDY 13',
			'18 Sun SPC Moss 12 Skipped SGT Okafor (12). On Leave, count holds.'
		]);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Fill 2 days' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		const [previewed] = await Promise.all(preview.mock.results.map((result) => result.value));
		expect(fill).toHaveBeenCalledWith('type-sd', '2026-10-17', '2026-10-31', previewed.picks);
		expect(preview).toHaveBeenCalledTimes(1);
	});

	it('shows the new picks when the roster moved since the preview, and stays open', async () => {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16) });
		const preview = vi
			.fn<() => Promise<RosterFillPreview>>()
			.mockResolvedValueOnce({
				picks: [{ date: '2026-10-17', personId: 'p-kim', count: 13, passedOver: [], returningFrom: null }],
				unfilled: []
			})
			.mockResolvedValueOnce({
				picks: [{ date: '2026-10-17', personId: 'p-moss', count: 13, passedOver: [], returningFrom: null }],
				unfilled: []
			});
		renderPlanner({
			personnel: [kim, okafor, hale, moss],
			rosters: {
				views: new Map([['type-sd', staffDutyRoster()]]),
				preview,
				fill: vi.fn(async () => 'changed' as const)
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Fill Staff Duty from roster' }));
		const dialog = await screen.findByRole('dialog', { name: 'Fill from roster, Staff Duty' });
		await within(dialog).findByText('Kim');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Fill 1 day' }));

		expect(await within(dialog).findByRole('alert')).toBeTruthy();
		expect(await within(dialog).findByText('Moss')).toBeTruthy();
		expect(preview).toHaveBeenCalledTimes(2);
	});

	describe('Find replacement', () => {
		const okaforOnLeave: DailyAssignment[] = [duty('2026-10-20', 'type-sd', 'p-okafor')];
		const leaveConflict = staffDutyRoster({
			conflicts: [{ date: '2026-10-20', personId: 'p-okafor', code: 'A', reason: 'Leave' }]
		});

		function plan(selected: string, overrides: Partial<RosterReplacement> = {}): RosterReplacement {
			return {
				date: '2026-10-20',
				replacing: { personId: 'p-okafor', count: 12, effect: { code: 'A', reason: 'Leave' } },
				nextUp: 'p-kim',
				candidates: [
					{ personId: 'p-kim', count: 9, adjacent: [{ name: 'CQ', day: 'after' }] },
					{ personId: 'p-moss', count: 0, adjacent: [] }
				],
				cantPull: [{ personId: 'p-okafor', count: 12, code: 'A', reason: 'Leave' }],
				selected,
				repicks: selected === 'p-kim' ? [{ date: '2026-10-23', was: 'p-kim', personId: 'p-moss' }] : [],
				unfilled: [],
				...overrides
			};
		}

		async function openReplacement() {
			const panel = screen.getByRole('region', { name: 'Conflicts' });
			await fireEvent.click(within(panel).getByRole('button', { name: 'Find replacement for Staff Duty, Tue 20 Oct' }));
			return screen.findByRole('dialog', { name: 'Replace SGT Okafor, Staff Duty, Tue 20 Oct' });
		}

		it("preselects the rule's pick, previews the re-picks for another choice and assigns it with them", async () => {
			const replacement = vi.fn(async (_typeId: string, _date: string, assigneeId?: string) =>
				plan(assigneeId ?? 'p-kim')
			);
			const { promise, resolve } = Promise.withResolvers<'saved'>();
			const replace = vi.fn(() => promise);
			renderPlanner({
				assignments: okaforOnLeave,
				personnel: [kim, okafor, hale, moss],
				rosters: { views: new Map([['type-sd', leaveConflict]]), replacement, replace }
			});

			const dialog = await openReplacement();
			const next = await within(dialog).findByRole('radio', { name: 'SGT Kim, count 9, next up, CQ the next day' });
			expect(next.getAttribute('aria-checked')).toBe('true');
			await waitFor(() => expect(document.activeElement).toBe(next));
			expect(within(dialog).getByText('SGT Okafor · Leave, holds at 12')).toBeTruthy();
			expect(
				within(within(dialog).getByRole('list', { name: 'Re-picked days' }).firstElementChild as HTMLElement).getByText(
					'SPC Moss'
				)
			).toBeTruthy();
			expect(replacement).toHaveBeenCalledWith('type-sd', '2026-10-20', undefined);

			await fireEvent.click(within(dialog).getByRole('radio', { name: 'SPC Moss, count 0' }));
			await waitFor(() => expect(replacement).toHaveBeenLastCalledWith('type-sd', '2026-10-20', 'p-moss'));
			await waitFor(() => expect(within(dialog).queryByRole('list', { name: 'Re-picked days' })).toBeNull());
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Assign Moss' }));

			expect(replace).toHaveBeenCalledWith('type-sd', plan('p-moss'));
			expect(screen.getByRole('dialog')).toBe(dialog);
			resolve('saved');
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			expect(document.activeElement).toBe(
				screen.getByRole('button', { name: 'Find replacement for Staff Duty, Tue 20 Oct' })
			);
		});

		it('shows a failed preview with a retry, blocks a replacement that leaves a day unfilled, and hands off to the duty picker', async () => {
			const replacement = vi
				.fn<() => Promise<RosterReplacement>>()
				.mockRejectedValueOnce(new Error('Server unavailable'))
				.mockResolvedValue(plan('p-kim', { repicks: [], unfilled: ['2026-10-23'] }));
			renderPlanner({
				assignments: okaforOnLeave,
				personnel: [kim, okafor, hale, moss],
				rosters: { views: new Map([['type-sd', leaveConflict]]), replacement }
			});

			const dialog = await openReplacement();
			expect(await within(dialog).findByText('Server unavailable')).toBeTruthy();
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Retry preview' }));

			expect(await within(dialog).findByText(/Nobody on the roster can take 23 Oct/)).toBeTruthy();
			expect((within(dialog).getByRole('button', { name: 'Assign Kim' }) as HTMLButtonElement).disabled).toBe(true);

			await fireEvent.click(within(dialog).getByRole('button', { name: 'Someone else' }));
			expect(await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' })).toBeTruthy();
			expect(screen.queryByRole('dialog', { name: /^Replace/ })).toBeNull();
		});

		it('returns a Someone else pick off the roster to the replacement, previews its re-picks and assigns them together', async () => {
			const replacement = vi.fn(async (_typeId: string, _date: string, assigneeId?: string) =>
				assigneeId === 'p-reed'
					? plan('p-reed', { repicks: [{ date: '2026-10-23', was: 'p-moss', personId: 'p-kim' }] })
					: plan('p-kim')
			);
			const replace = vi.fn(async () => 'saved' as const);
			const { onSetAssignment } = renderPlanner({
				assignments: okaforOnLeave,
				personnel: [kim, okafor, hale, moss, reed],
				rosters: { views: new Map([['type-sd', leaveConflict]]), replacement, replace, day: () => detailDay }
			});

			const dialog = await openReplacement();
			await within(dialog).findByRole('button', { name: 'Assign Kim' });
			const someoneElse = within(dialog).getByRole('button', { name: 'Someone else' });
			expect(document.getElementById(someoneElse.getAttribute('aria-describedby')!)?.textContent).toMatch(
				/re-picks the later roster days too/
			);
			await fireEvent.click(someoneElse);
			const picker = await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' });
			expect(document.getElementById(picker.getAttribute('aria-describedby')!)?.textContent).toMatch(
				/re-picks the later roster days too/
			);
			expect(within(picker).queryByRole('option', { name: /Okafor/ })).toBeNull();
			expect(within(picker).queryByRole('button', { name: 'Clear assignment' })).toBeNull();
			await fireEvent.input(within(picker).getByRole('combobox', { name: 'Find person' }), {
				target: { value: 'reed' }
			});
			await fireEvent.click(await within(picker).findByRole('option', { name: 'PV2 Reed, Sam, not on this roster' }));

			const back = await screen.findByRole('dialog', { name: 'Replace SGT Okafor, Staff Duty, Tue 20 Oct' });
			const picked = await within(back).findByRole('radio', { name: 'PV2 Reed, Not on this roster' });
			expect(picked.getAttribute('aria-checked')).toBe('true');
			expect(replacement).toHaveBeenLastCalledWith('type-sd', '2026-10-20', 'p-reed');
			const repicked = await within(back).findByRole('list', { name: 'Re-picked days' });
			expect(repicked.textContent!.replace(/\s+/g, ' ').trim()).toBe('23 Fri SPC Moss SGT Kim');
			await fireEvent.click(within(back).getByRole('button', { name: 'Assign Reed' }));

			expect(replace).toHaveBeenCalledWith(
				'type-sd',
				plan('p-reed', { repicks: [{ date: '2026-10-23', was: 'p-moss', personId: 'p-kim' }] })
			);
			expect(onSetAssignment).not.toHaveBeenCalled();
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		});

		it('goes back to the replacement when the Someone else picker closes without a pick', async () => {
			renderPlanner({
				assignments: okaforOnLeave,
				personnel: [kim, okafor, hale, moss],
				rosters: {
					views: new Map([['type-sd', leaveConflict]]),
					replacement: vi.fn(async () => plan('p-kim')),
					day: () => detailDay
				}
			});

			const dialog = await openReplacement();
			await fireEvent.click(await within(dialog).findByRole('button', { name: 'Someone else' }));
			const picker = await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' });
			await fireEvent.keyDown(picker, { key: 'Escape' });

			const back = await screen.findByRole('dialog', { name: 'Replace SGT Okafor, Staff Duty, Tue 20 Oct' });
			expect(await within(back).findByRole('button', { name: 'Assign Kim' })).toBeTruthy();
		});

		it('reads the preview again and stays open when the roster moved since it', async () => {
			const replacement = vi
				.fn<() => Promise<RosterReplacement>>()
				.mockResolvedValueOnce(plan('p-kim'))
				.mockResolvedValueOnce(plan('p-moss', { nextUp: 'p-moss' }));
			renderPlanner({
				assignments: okaforOnLeave,
				personnel: [kim, okafor, hale, moss],
				rosters: {
					views: new Map([['type-sd', leaveConflict]]),
					replacement,
					replace: vi.fn(async () => 'changed' as const)
				}
			});

			const dialog = await openReplacement();
			await fireEvent.click(await within(dialog).findByRole('button', { name: 'Assign Kim' }));

			expect(await within(dialog).findByRole('button', { name: 'Assign Moss' })).toBeTruthy();
			expect(within(dialog).getByRole('alert')).toBeTruthy();
			expect(replacement).toHaveBeenCalledTimes(2);
		});

		it('opens the duty picker for a conflict on a day the roster does not detail', async () => {
			const replacement = vi.fn(async () => plan('p-kim'));
			renderPlanner({
				assignments: okaforOnLeave,
				availabilityEntries: [
					{
						id: 'leave-1',
						personnelId: 'p-okafor',
						statusTypeId: 'leave',
						startDate: '2026-10-20',
						endDate: '2026-10-20'
					}
				],
				rosters: { views: new Map([['type-sd', staffDutyRoster({ covered: new Set() })]]), replacement }
			});

			await fireEvent.click(
				within(screen.getByRole('region', { name: 'Conflicts' })).getByRole('button', {
					name: 'Find replacement for Staff Duty, Tue 20 Oct'
				})
			);

			expect(await screen.findByRole('dialog', { name: 'Staff Duty, Tue 20 Oct' })).toBeTruthy();
			expect(replacement).not.toHaveBeenCalled();
		});
	});

	it("locks every assignment action and offers Retry while the month's re-read after a refused write has failed", async () => {
		const onRetry = vi.fn();
		renderPlanner({
			assignments: [duty('2026-10-20', 'type-sd', 'p-okafor')],
			personnel: [kim, okafor, hale, moss],
			rosters: {
				views: new Map([
					[
						'type-sd',
						staffDutyRoster({
							conflicts: [{ date: '2026-10-20', personId: 'p-okafor', code: 'A', reason: 'Leave' }]
						})
					]
				])
			},
			staleAssignments: { retrying: false, onRetry }
		});

		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('could not be read again');
		expect((screen.getByRole('button', { name: 'Assign Staff Duty, Wed 21 Oct' }) as HTMLButtonElement).disabled).toBe(
			true
		);
		expect((screen.getByRole('button', { name: 'Staff Duty column actions' }) as HTMLButtonElement).disabled).toBe(
			true
		);
		expect(
			(
				within(screen.getByRole('region', { name: 'Conflicts' })).getByRole('button', {
					name: 'Find replacement for Staff Duty, Tue 20 Oct'
				}) as HTMLButtonElement
			).disabled
		).toBe(true);

		await fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('switches to Quick fill with One person instead', async () => {
		renderPlanner({ rosters: { views: new Map([['type-sd', staffDutyRoster()]]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Fill Staff Duty from roster' }));
		await screen.findByRole('dialog', { name: 'Fill from roster, Staff Duty' });
		await fireEvent.click(screen.getByRole('button', { name: 'One person instead' }));

		expect(screen.getByRole('dialog', { name: 'Quick fill, Staff Duty' })).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeTruthy();
	});

	it('opens Quick fill from the column actions, with Fill from roster one link away', async () => {
		renderPlanner({ rosters: { views: new Map([['type-sd', staffDutyRoster()]]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Staff Duty column actions' }));
		expect(await screen.findByRole('combobox', { name: 'Assignee' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Fill from roster' }));

		expect(screen.getByRole('dialog', { name: 'Fill from roster, Staff Duty' })).toBeTruthy();
	});
});

describe('MonthlyAssignmentPlanner duty swaps', () => {
	// Kim holds Tue 20 Oct and Okafor Tue 27 Oct, the two days a swap trades. Both lie after the faked today.
	const planned = [duty('2026-10-20', 'type-sd', 'p-kim'), duty('2026-10-27', 'type-sd', 'p-okafor')];
	const swapped = {
		id: 'swap-1',
		days: [
			{ date: '2026-10-20', heldBy: 'p-okafor' },
			{ date: '2026-10-27', heldBy: 'p-kim' }
		]
	} as const;

	function rosterView(overrides: Partial<RosterView> = {}): RosterView {
		return {
			typeId: 'type-sd',
			current: null,
			todayAssignee: null,
			excused: [],
			covered: new Set(['2026-10-20', '2026-10-27']),
			conflicts: [],
			swaps: [],
			...overrides
		};
	}

	const options = (warnings: RosterSwapOptions['days'][number]['warnings'] = []): RosterSwapOptions => ({
		date: '2026-10-20',
		personId: 'p-kim',
		days: [{ date: '2026-10-27', personId: 'p-okafor', warnings }]
	});

	function renderSwaps(
		rosters: NonNullable<Parameters<typeof renderPlanner>[0]>['rosters'],
		assignments: DailyAssignment[] = planned
	) {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 16) });
		return renderPlanner({ assignments, personnel: [kim, okafor, hale], rosters });
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	async function openPicker(name: string) {
		await fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Staff Duty, ${name}:`) }));
		return screen.findByRole('dialog', { name: `Staff Duty, ${name}` });
	}

	async function openSwap() {
		const picker = await openPicker('Tue 20 Oct');
		await fireEvent.click(within(picker).getByRole('button', { name: 'Swap with…' }));
		return screen.findByRole('dialog', { name: 'Swap Staff Duty, Tue 20 Oct' });
	}

	it('holds a skeleton where the days will appear, then previews both days with their warnings and posts the swap', async () => {
		const read = Promise.withResolvers<RosterSwapOptions>();
		const swapOptions = vi.fn(() => read.promise);
		const swap = vi.fn(async (): Promise<RosterSwapOutcome> => ({ status: 'saved' }));
		renderSwaps({ views: new Map([['type-sd', rosterView()]]), swapOptions, swap });

		const dialog = await openSwap();
		expect(within(dialog).getByRole('status', { name: 'Loading days to swap with' })).toBeTruthy();
		expect((within(dialog).getByRole('button', { name: 'Swap days' }) as HTMLButtonElement).disabled).toBe(true);
		expect(swapOptions).toHaveBeenCalledWith('type-sd', '2026-10-20');

		read.resolve(options([{ personId: 'p-okafor', date: '2026-10-20', code: 'A', reason: 'Leave' }]));
		const choice = await within(dialog).findByRole('radio', { name: /^Tue 27 Oct, SGT Okafor/ });
		expect(within(dialog).queryByRole('status', { name: 'Loading days to swap with' })).toBeNull();
		await fireEvent.click(choice);

		const after = within(dialog).getByRole('list', { name: 'Swapped days' });
		expect(
			within(after)
				.getAllByRole('listitem')
				.map((row) => row.textContent!.replace(/\s+/g, ' ').trim())
		).toEqual(['Tue 20 Oct SGT Kim SGT Okafor', 'Tue 27 Oct SGT Okafor SGT Kim']);
		expect(within(dialog).getAllByText(/Okafor · Leave \(A\) on Tue 20 Oct/).length).toBeGreaterThan(0);
		expect(swap).not.toHaveBeenCalled();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Swap days' }));
		expect(swap).toHaveBeenCalledWith('type-sd', [
			{ date: '2026-10-20', was: 'p-kim' },
			{ date: '2026-10-27', was: 'p-okafor' }
		]);
		await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Swap Staff Duty/ })).toBeNull());
	});

	it('shows the load error with Retry in the list region and recovers without closing', async () => {
		const swapOptions = vi
			.fn<() => Promise<RosterSwapOptions>>()
			.mockRejectedValueOnce(new Error('Server unavailable'))
			.mockResolvedValue(options());
		renderSwaps({ views: new Map([['type-sd', rosterView()]]), swapOptions });

		const dialog = await openSwap();
		expect(await within(dialog).findByText('Server unavailable')).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

		expect(await within(dialog).findByRole('radio', { name: /^Tue 27 Oct/ })).toBeTruthy();
		expect(swapOptions).toHaveBeenCalledTimes(2);
	});

	it('reloads the days and stays open when the roster changed, and shows the server reason for any other refusal', async () => {
		const swapOptions = vi.fn(async () => options());
		const swap = vi
			.fn<() => Promise<RosterSwapOutcome>>()
			.mockResolvedValueOnce({ status: 'changed' })
			.mockResolvedValueOnce({ status: 'refused', message: 'Swap only today or later days.' });
		renderSwaps({ views: new Map([['type-sd', rosterView()]]), swapOptions, swap });

		const dialog = await openSwap();
		await fireEvent.click(await within(dialog).findByRole('radio', { name: /^Tue 27 Oct/ }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Swap days' }));

		await waitFor(() => expect(swapOptions).toHaveBeenCalledTimes(2));
		expect(
			(await within(dialog).findAllByRole('alert')).some((alert) => /roster changed/.test(alert.textContent!))
		).toBe(true);
		expect(screen.getByRole('dialog', { name: 'Swap Staff Duty, Tue 20 Oct' })).toBe(dialog);

		await fireEvent.click(await within(dialog).findByRole('radio', { name: /^Tue 27 Oct/ }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Swap days' }));
		expect(await within(dialog).findByText('Swap only today or later days.')).toBeTruthy();
		expect(screen.getByRole('dialog', { name: 'Swap Staff Duty, Tue 20 Oct' })).toBe(dialog);
	});

	it('swaps from the new holder after a refusal shows the day changed hands', async () => {
		const swapOptions = vi
			.fn<() => Promise<RosterSwapOptions>>()
			.mockResolvedValueOnce(options())
			.mockResolvedValue({ ...options(), personId: 'p-hale' });
		const swap = vi
			.fn<() => Promise<RosterSwapOutcome>>()
			.mockResolvedValueOnce({ status: 'changed' })
			.mockResolvedValueOnce({ status: 'saved' });
		renderSwaps({ views: new Map([['type-sd', rosterView()]]), swapOptions, swap });

		const dialog = await openSwap();
		await fireEvent.click(await within(dialog).findByRole('radio', { name: /^Tue 27 Oct/ }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Swap days' }));

		await waitFor(() => expect(swapOptions).toHaveBeenCalledTimes(2));
		expect(await within(dialog).findByText(/Swap SSG\s+Hale/)).toBeTruthy();
		expect((within(dialog).getByRole('radio', { name: /^Tue 27 Oct/ }) as HTMLButtonElement).dataset.state).toBe(
			'unchecked'
		);
		await fireEvent.click(within(dialog).getByRole('radio', { name: /^Tue 27 Oct/ }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Swap days' }));
		expect(swap).toHaveBeenLastCalledWith('type-sd', [
			{ date: '2026-10-20', was: 'p-hale' },
			{ date: '2026-10-27', was: 'p-okafor' }
		]);
	});

	it('offers no swap to an operator without roster counts, or on a day that has passed', async () => {
		renderPlanner({ assignments: planned, personnel: [kim, okafor, hale] });
		const picker = await openPicker('Tue 20 Oct');
		expect(within(picker).queryByRole('button', { name: 'Swap with…' })).toBeNull();
		cleanup();

		vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21) });
		renderPlanner({
			assignments: planned,
			personnel: [kim, okafor, hale],
			rosters: { views: new Map([['type-sd', rosterView()]]) }
		});
		const past = await openPicker('Tue 20 Oct');
		expect(within(past).queryByRole('button', { name: 'Swap with…' })).toBeNull();
	});

	it('marks a swapped day with who held it, names the swap in its picker, and undoes it while both days are ahead', async () => {
		const undoSwap = vi.fn(async () => true);
		renderSwaps({ views: new Map([['type-sd', rosterView({ swaps: [swapped] })]]), undoSwap });

		expect(
			screen.getByRole('button', { name: /^Staff Duty, Tue 20 Oct:.*swapped with 27 Oct, held by SGT Okafor/ })
		).toBeTruthy();
		const picker = await openPicker('Tue 20 Oct');
		expect(within(picker).queryByRole('button', { name: 'Swap with…' })).toBeNull();
		expect(document.getElementById('duty-picker-swapped')!.textContent!.replace(/\s+/g, ' ')).toMatch(
			/27 Oct.*Okafor held this day.*Kim stands it.*Saving another person or clearing this day ends the swap/
		);

		await fireEvent.click(within(picker).getByRole('button', { name: 'Undo swap' }));
		expect(undoSwap).toHaveBeenCalledWith('swap-1');
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('leaves a swap whose day has passed without Undo', async () => {
		const past = {
			id: 'swap-old',
			days: [
				{ date: '2026-10-10', heldBy: 'p-okafor' },
				{ date: '2026-10-20', heldBy: 'p-kim' }
			]
		} as const;
		renderSwaps({ views: new Map([['type-sd', rosterView({ swaps: [past] })]]) }, [
			duty('2026-10-10', 'type-sd', 'p-kim'),
			duty('2026-10-20', 'type-sd', 'p-okafor')
		]);

		const picker = await openPicker('Tue 20 Oct');
		expect(within(picker).queryByRole('button', { name: 'Undo swap' })).toBeNull();
		expect(document.getElementById('duty-picker-swapped')).toBeTruthy();
	});

	it('names how many swaps Clear month ends, and none when the month holds no swap', async () => {
		renderSwaps({ views: new Map([['type-sd', rosterView({ swaps: [swapped] })]]) });
		await openColumnMenu();
		await fireEvent.click(screen.getByRole('button', { name: 'Clear month' }));
		expect(screen.getByRole('alertdialog').textContent).toMatch(/ends 1 duty swap/);
		cleanup();

		renderSwaps({ views: new Map([['type-sd', rosterView()]]) });
		await openColumnMenu();
		await fireEvent.click(screen.getByRole('button', { name: 'Clear month' }));
		expect(screen.getByRole('alertdialog').textContent).not.toMatch(/swap/);
	});

	it('warns that Quick fill ends a swap only when it would move the swapped day to someone else', async () => {
		renderSwaps({ views: new Map([['type-sd', rosterView({ swaps: [swapped] })]]) });
		await openColumnMenu();
		const select = screen.getByRole('combobox', { name: 'Assignee' }) as HTMLSelectElement;
		const kimOption = within(select).getByRole('option', { name: /Kim/ }) as HTMLOptionElement;
		await fireEvent.change(select, { target: { value: kimOption.value } });

		expect(screen.queryByText(/Ends 1 duty swap/)).toBeNull();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Only open days' }));
		expect(screen.getByText(/Ends 1 duty swap/)).toBeTruthy();
	});

	it('says in Find replacement that assigning on a swapped day ends the swap', async () => {
		const replacement = async (): Promise<RosterReplacement> => ({
			date: '2026-10-20',
			replacing: { personId: 'p-kim', count: 12, effect: { code: 'A', reason: 'Leave' } },
			nextUp: 'p-hale',
			candidates: [{ personId: 'p-hale', count: 9, adjacent: [] }],
			cantPull: [],
			selected: 'p-hale',
			repicks: [],
			unfilled: []
		});
		renderSwaps({
			views: new Map([
				[
					'type-sd',
					rosterView({
						swaps: [swapped],
						conflicts: [{ date: '2026-10-20', personId: 'p-kim', code: 'A', reason: 'Leave' }]
					})
				]
			]),
			replacement
		});

		const panel = screen.getByRole('region', { name: 'Conflicts' });
		await fireEvent.click(within(panel).getByRole('button', { name: 'Find replacement for Staff Duty, Tue 20 Oct' }));
		const dialog = await screen.findByRole('dialog', { name: /^Replace/ });

		expect(await within(dialog).findByText(/Ends 1 duty swap/)).toBeTruthy();
	});
});
