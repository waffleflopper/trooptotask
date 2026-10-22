// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	RosterFillPick,
	RosterFillPreview
} from '$features/calendar/contracts';
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
	} = {}
) {
	const onSetAssignment = vi.fn(props.onSetAssignment ?? (async () => true));
	const onSetAssignmentBatch = vi.fn(props.onSetAssignmentBatch ?? (async () => true));
	const rosters = props.rosters && {
		status: 'ready' as const,
		stale: false,
		views: new Map(),
		onRetry: vi.fn(),
		preview: vi.fn(async () => ({ picks: [], unfilled: [] })),
		fill: vi.fn(async () => 'saved' as const),
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
			rosters
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
		expect(within(panel).getByText('SSG Hale is excused.')).toBeTruthy();
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

	it('shows no counts and keeps Quick fill when the operator cannot see the whole Organization', async () => {
		renderPlanner();

		expect(screen.queryByRole('region', { name: 'Roster · count today' })).toBeNull();
		await openColumnMenu();
		expect(screen.queryByRole('button', { name: 'One person instead' })).toBeNull();
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

		await fireEvent.click(screen.getByRole('button', { name: 'Staff Duty column actions' }));
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

		await fireEvent.click(screen.getByRole('button', { name: 'Staff Duty column actions' }));
		const dialog = await screen.findByRole('dialog', { name: 'Fill from roster, Staff Duty' });
		await within(dialog).findByText('Kim');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Fill 1 day' }));

		expect(await within(dialog).findByRole('alert')).toBeTruthy();
		expect(await within(dialog).findByText('Moss')).toBeTruthy();
		expect(preview).toHaveBeenCalledTimes(2);
	});

	it('switches to Quick fill with One person instead', async () => {
		renderPlanner({ rosters: { views: new Map([['type-sd', staffDutyRoster()]]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Staff Duty column actions' }));
		await screen.findByRole('dialog', { name: 'Fill from roster, Staff Duty' });
		await fireEvent.click(screen.getByRole('button', { name: 'One person instead' }));

		expect(screen.getByRole('dialog', { name: 'Quick fill, Staff Duty' })).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeTruthy();
	});
});
