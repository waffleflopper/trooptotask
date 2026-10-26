// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import type { CalendarEventsPageAccess } from '../../contracts';
import type { EventRead } from '../../events/eventModel';
import type { EventContribution } from '../eventWorkModel';
import type { Tasking, TaskingActivityLog, TaskingChoices, TaskingDetail } from '../taskingModel';
import type {
	AvailabilityCoverage,
	StaffingPersonState,
	StaffingPicker,
	TaskingPick,
	TaskingStaffing
} from '../staffing/staffingModel';
import type { TaskingLists } from '../taskingListsModel';
import TaskingDetailPage from './TaskingDetailPage.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), replaceState: vi.fn() }));

const ALPHA = '00000000-0000-4000-8000-000000000201';
const ALICE = '00000000-0000-4000-8000-000000000501';
const BRUNO = '00000000-0000-4000-8000-000000000502';
const tasking: Tasking = {
	id: '00000000-0000-4000-8000-000000000101',
	title: 'Provide four trauma-lane medics',
	event: null,
	responsibility: { kind: 'group', groupId: ALPHA },
	suspenseOn: '2026-10-30',
	execution: null,
	requirement: null,
	instructions: null,
	status: { kind: 'in_progress' },
	readiness: { equipment: null, checklist: null }
};
const org: CalendarEventsPageAccess = {
	orgId: 'org-a',
	orgUrlSegment: 'org-a',
	orgName: 'C Co',
	userId: '00000000-0000-4000-8000-000000000003',
	affordanceForFeatureAction: () => ({ allowed: true })
};
const pick = (personnelId: string, lastName: string): TaskingPick => ({
	personnelId,
	rank: 'SPC',
	firstName: 'Pat',
	lastName,
	groupId: ALPHA,
	mos: '68W',
	clinicRole: '',
	archived: false,
	selectedAt: '2026-10-01T00:00:00Z',
	reviewSince: null
});
const staffing = (revision: number, ...picks: TaskingPick[]): TaskingStaffing => ({
	revision,
	picked: picks.length,
	needsReview: 0,
	outsideScope: 0,
	picks
});
const never = <T>() => new Promise<T>(() => {});
const loaded = <T>(value: T) => Promise.resolve({ status: 'loaded', value } as EventRead<T>);

function open(
	shown: Tasking,
	people: Promise<EventRead<TaskingStaffing>> = never(),
	choices = never<EventRead<TaskingChoices | null>>(),
	activity: TaskingActivityLog = { entries: [], eventTitles: {} }
) {
	const detail: TaskingDetail = { tasking: shown, groups: { [ALPHA]: 'Alpha' }, members: {} };
	render(TaskingDetailPage, {
		org,
		today: '2026-10-26',
		detail: loaded(detail),
		activity: loaded(activity),
		people,
		pickStates: loaded<Record<string, StaffingPersonState>>({}),
		availabilityGaps: never<EventRead<AvailabilityCoverage>>(),
		lists: loaded<TaskingLists>({ equipment: [], checklist: [] }),
		restOfEvent: loaded<EventContribution[]>([]),
		choices
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('TaskingDetailPage', () => {
	it('explains why the retained Tasking became standalone after its Event was deleted', async () => {
		open(tasking, never(), never(), {
			entries: [
				{
					id: 1,
					at: '2026-10-26T12:00:00Z',
					actorUserId: org.userId,
					kind: 'event_deleted',
					eventId: 'deleted-event',
					eventTitle: 'Best Medic Competition'
				}
			],
			eventTitles: {}
		});
		expect((await screen.findByText(/unlinked from Best Medic Competition/)).textContent).toContain(
			'unlinked from Best Medic Competition, which was deleted'
		);
	});

	it('keeps a Block draft when an earlier Edit finishes loading its choices', async () => {
		let resolveChoices!: (value: EventRead<TaskingChoices | null>) => void;
		open(tasking, never(), new Promise((resolve) => (resolveChoices = resolve)));

		await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Mark blocked' }));
		const reason = (await screen.findByLabelText('Reason')) as HTMLTextAreaElement;
		await fireEvent.input(reason, { target: { value: 'Litters short' } });
		resolveChoices({ status: 'loaded', value: { groups: [{ id: ALPHA, name: 'Alpha' }], events: [] } });

		await new Promise((settled) => setTimeout(settled));

		expect(screen.queryByLabelText('Outcome')).toBeNull();
		expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('Litters short');
	});

	it('corrects the reason of a Blocked Tasking without unblocking it', async () => {
		const blocked: Tasking = {
			...tasking,
			status: { kind: 'blocked', reason: 'Litters short', at: '2026-10-24T12:00:00Z', by: null }
		};
		const send = vi.fn(async (_url: string, init: RequestInit) =>
			Response.json({ ...blocked, status: { ...blocked.status, reason: JSON.parse(String(init.body)).reason } })
		);
		vi.stubGlobal('fetch', send);
		open(blocked);

		await fireEvent.click(await screen.findByRole('button', { name: 'Edit reason' }));
		const reason = (await screen.findByLabelText('Reason')) as HTMLTextAreaElement;
		expect(reason.value).toBe('Litters short');
		await fireEvent.input(reason, { target: { value: 'Two litters still at the motor pool' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save reason' }));

		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(JSON.parse(String(send.mock.calls[0][1].body))).toEqual({
			action: 'block',
			reason: 'Two litters still at the motor pool'
		});
	});

	describe('undoing a picker save', () => {
		const staffed: Tasking = { ...tasking, requirement: { count: 2, qualifications: null } };
		const before = staffing(1, pick(BRUNO, 'Baker'));
		// Read after the save, so it may already carry a newer revision than the one the save wrote.
		const after = staffing(3, pick(ALICE, 'Avery'), pick(BRUNO, 'Baker'));
		const picker: StaffingPicker = {
			tasking: staffed,
			states: {},
			staffing: before,
			candidates: [pick(ALICE, 'Avery'), pick(BRUNO, 'Baker')],
			advisories: { kind: 'loaded', byPerson: {} }
		};

		async function saveAndUndo(undoReply: Response) {
			const saves: unknown[] = [];
			const replies = [Response.json({ outcome: 'saved', revision: 2, staffing: after }), undoReply];
			vi.stubGlobal(
				'fetch',
				vi.fn(async (_url: string, init?: RequestInit) => {
					if (!init?.method) return Response.json(picker);
					saves.push(JSON.parse(String(init.body)));
					return replies.shift()!;
				})
			);
			const success = vi.spyOn(toastStore, 'success').mockReturnValue('toast');
			const error = vi.spyOn(toastStore, 'error').mockReturnValue('toast');
			open(staffed, loaded(before));

			await fireEvent.click(await screen.findByRole('button', { name: /Assign people/ }));
			await fireEvent.click(await screen.findByRole('checkbox', { name: /Avery/ }));
			await fireEvent.click(screen.getByRole('button', { name: /Save \d/ }));
			await waitFor(() => expect(success).toHaveBeenCalledOnce());
			success.mock.calls[0][2]!.onClick();
			await waitFor(() => expect(saves).toHaveLength(2));
			return { saves, success, error };
		}

		it('puts the earlier selection back against the saved revision', async () => {
			const { saves, success, error } = await saveAndUndo(
				Response.json({ outcome: 'saved', revision: 3, staffing: before })
			);

			expect(saves[1]).toEqual({ personnelIds: [BRUNO], keep: [], removeOutsideScope: false, expectedRevision: 2 });
			await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
			expect(error).not.toHaveBeenCalled();
			await waitFor(() => expect(screen.queryByText(/Avery/)).toBeNull());
		});

		it('says the Undo was refused when someone saved since, and shows their selection', async () => {
			const theirs = staffing(3, pick(ALICE, 'Avery'));
			const { error } = await saveAndUndo(
				Response.json({ outcome: 'conflict', revision: 3, staffing: theirs }, { status: 409 })
			);

			await waitFor(() => expect(error).toHaveBeenCalledOnce());
			await waitFor(() => expect(screen.queryByText(/Baker/)).toBeNull());
			expect(screen.getByText(/Avery/)).toBeTruthy();
		});
	});
});
