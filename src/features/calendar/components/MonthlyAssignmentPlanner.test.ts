// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';

const staffDuty: AssignmentType = {
	id: 'type-sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#2563eb',
	exemptPersonnelIds: ['p-hale'],
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

function duty(date: string, assignmentTypeId: string, assigneeId: string): DailyAssignment {
	return { id: `${date}-${assignmentTypeId}`, date, assignmentTypeId, assigneeId };
}

afterEach(cleanup);

function renderPlanner(
	props: {
		assignmentTypes?: AssignmentType[];
		assignments?: DailyAssignment[];
		availabilityEntries?: AvailabilityEntry[];
		rangeStatus?: 'ready' | 'loading' | 'error';
		onSetAssignment?: (date: string, typeId: string, assigneeId: string) => Promise<boolean>;
		onSetAssignmentBatch?: (
			batch: { date: string; assignmentTypeId: string; assigneeId: string }[]
		) => Promise<boolean>;
		onRetry?: () => void;
	} = {}
) {
	const onSetAssignment = vi.fn(props.onSetAssignment ?? (async () => true));
	const onSetAssignmentBatch = vi.fn(props.onSetAssignmentBatch ?? (async () => true));
	render(MonthlyAssignmentPlanner, {
		props: {
			currentDate: new Date(2026, 9, 1),
			rangeStatus: props.rangeStatus ?? 'ready',
			onRetry: props.onRetry ?? vi.fn(),
			assignmentTypes: props.assignmentTypes ?? [staffDuty],
			assignments: props.assignments ?? [],
			availabilityEntries: props.availabilityEntries ?? [],
			statusTypes: [{ id: 'leave', name: 'Leave', color: '#0a0', textColor: '#fff', shortLabel: null, sortOrder: 0 }],
			specialDays: [],
			personnelByGroup: [{ group: 'Alpha', personnel: [kim, okafor, hale] }],
			groups: [
				{ id: 'g-alpha', name: 'Alpha', sortOrder: 0 },
				{ id: 'g-bravo', name: 'Bravo', sortOrder: 1 }
			],
			onSetAssignment,
			onSetAssignmentBatch
		}
	});
	return { onSetAssignment, onSetAssignmentBatch };
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

		expect(
			within(select)
				.getAllByRole('option')
				.map((option) => option.textContent?.trim())
		).toEqual(['Select person…', 'SGT Kim, Jae-won', 'SGT Okafor, Ife']);
		expect((screen.getByRole('button', { name: 'Fill 22 days' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('saves a Group duty by the Group id', async () => {
		const guard: AssignmentType = {
			...staffDuty,
			id: 'type-gg',
			name: 'Gate Guard',
			shortName: 'GG',
			assignTo: 'group',
			exemptPersonnelIds: []
		};
		const { onSetAssignmentBatch } = renderPlanner({ assignmentTypes: [guard] });

		await openColumnMenu('Gate Guard');
		await chooseAssignee(/Bravo/);
		await fireEvent.click(screen.getByRole('button', { name: 'Fill 22 days' }));

		await waitFor(() => expect(onSetAssignmentBatch).toHaveBeenCalledTimes(1));
		expect(new Set(onSetAssignmentBatch.mock.calls[0][0].map((write) => write.assigneeId))).toEqual(
			new Set(['g-bravo'])
		);
	});
});

describe('MonthlyAssignmentPlanner table', () => {
	it('lists the Calendar lane types in lane order, then planner-only types, and leaves out archived ones', () => {
		const types: AssignmentType[] = [
			{ ...staffDuty, id: 'runner', name: 'Runner', shortName: 'RN', showOnCalendar: false, sortOrder: 0 },
			staffDuty,
			{ ...staffDuty, id: 'cq', name: 'CQ', shortName: 'CQ', sortOrder: 0 },
			{ ...staffDuty, id: 'old', name: 'Old', shortName: 'OLD', archivedAt: '2026-01-01T00:00:00.000Z' }
		];
		renderPlanner({ assignmentTypes: types });

		expect(
			screen.getAllByRole('button', { name: /column actions$/ }).map((button) => button.getAttribute('aria-label'))
		).toEqual(['CQ column actions', 'Staff Duty column actions', 'Runner column actions']);
	});

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
		expect(within(panel).getByText(/SGT Okafor, Ife is on Leave 20–23 Oct\./)).toBeTruthy();

		await fireEvent.click(within(panel).getByRole('button', { name: 'Find replacement for Staff Duty, Wed 21 Oct' }));
		await fireEvent.click(await screen.findByRole('option', { name: /Kim, Jae-won/ }));

		await waitFor(() => expect(onSetAssignment).toHaveBeenCalledWith('2026-10-21', 'type-sd', 'p-kim'));
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
