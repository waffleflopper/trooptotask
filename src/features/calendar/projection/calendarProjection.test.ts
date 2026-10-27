import { describe, expect, it, vi } from 'vitest';
import {
	calendarProjectionSchema,
	calendarTaskingFacts,
	EMPTY_PROJECTION,
	EMPTY_TASKING_FACTS,
	mergeProjections,
	mergeTaskingFacts,
	replaceProjectionRange,
	type ProjectedCommitment,
	type ProjectedEvent
} from './calendarProjection';
import { readCalendarProjection, type CalendarProjectionReader } from './calendarProjectionRead.server';
import type { EventTaskingSummary, TaskingRowFacts, TaskingWorkspace } from '../taskings/taskingReadModel';

const ids = {
	event: '11111111-1111-4111-8111-111111111111',
	other: '22222222-2222-4222-8222-222222222222',
	tasking: '33333333-3333-4333-8333-333333333333',
	person: '44444444-4444-4444-8444-444444444444'
};

const event = (overrides: Partial<ProjectedEvent> = {}): ProjectedEvent => ({
	id: ids.event,
	title: 'Field exercise',
	startsOn: '2026-05-04',
	endsOn: '2026-05-06',
	cancelled: false,
	hasWork: false,
	host: null,
	...overrides
});

const commitment = (overrides: Partial<ProjectedCommitment> = {}): ProjectedCommitment => ({
	conflicts: false,
	taskingId: ids.tasking,
	title: 'Submit roster',
	personnelId: ids.person,
	startsOn: '2026-05-04',
	endsOn: '2026-05-06',
	...overrides
});

describe('mergeProjections', () => {
	it('keeps one of each Event and commitment that two adjacent reads both return', () => {
		const left = { ...EMPTY_PROJECTION, events: [event()], commitments: [commitment()] };
		const right = { ...EMPTY_PROJECTION, events: [event()], commitments: [commitment()] };

		const merged = mergeProjections(left, right);

		expect(merged.events).toHaveLength(1);
		expect(merged.commitments).toHaveLength(1);
	});

	it('keeps a Person picked for two Taskings as two commitments and orders Events by start', () => {
		const later = event({ id: ids.other, title: 'Range day', startsOn: '2026-05-10', endsOn: '2026-05-10' });
		const merged = mergeProjections(
			{ ...EMPTY_PROJECTION, events: [later], commitments: [commitment()] },
			{ ...EMPTY_PROJECTION, events: [event()], commitments: [commitment({ taskingId: ids.other })] }
		);

		expect(merged.events.map((item) => item.id)).toEqual([ids.event, ids.other]);
		expect(merged.commitments).toHaveLength(2);
	});
});

describe('replaceProjectionRange', () => {
	const may = { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' };

	it('drops what an earlier read held over the range and keeps what lies outside it', () => {
		const outside = commitment({ taskingId: ids.other, startsOn: '2026-07-01', endsOn: '2026-07-02' });
		const stale = commitment({ startsOn: '2026-05-30', endsOn: '2026-06-02' });

		const result = replaceProjectionRange(
			{ ...EMPTY_PROJECTION, commitments: [stale, outside], events: [event()] },
			may,
			EMPTY_PROJECTION
		);

		expect(result.commitments).toEqual([outside]);
		expect(result.events).toEqual([]);
	});
});

describe('calendarProjectionSchema', () => {
	it('accepts what the database returns and refuses a row without a date', () => {
		const shaped = { ...EMPTY_PROJECTION, events: [event()] };

		expect(calendarProjectionSchema.parse(shaped)).toEqual(shaped);
		expect(() => calendarProjectionSchema.parse({ ...shaped, events: [{ ...event(), startsOn: null }] })).toThrow();
	});
});

const TODAY = '2026-05-10';

const row = (overrides: Partial<TaskingRowFacts> = {}): TaskingRowFacts => ({
	eventRelation: 'execution',
	picked: 2,
	required: 2,
	equipment: { ready: 0, total: 0, returnedQuantity: 0, totalQuantity: 0 },
	conflicts: 0,
	nextDate: '2026-05-12',
	suspenseOn: '2026-05-12',
	status: 'open',
	responsibleGroupId: null,
	...overrides
});

const summary = (overrides: Partial<EventTaskingSummary> = {}): EventTaskingSummary => ({
	total: 1,
	needAction: 0,
	overdue: 0,
	blocked: 0,
	needPeople: 0,
	fullyStaffedAndReady: 1,
	conflicts: 0,
	...overrides
});

const workspace = (overrides: Partial<TaskingWorkspace> = {}): TaskingWorkspace => ({
	taskings: {},
	events: {},
	counts: { active: 0, overdue: 0, blocked: 0, needsPeople: 0, completed: 0 },
	...overrides
});

describe('calendarTaskingFacts', () => {
	it('counts an active Tasking as needing action when it is overdue, blocked or short of people', () => {
		const facts = calendarTaskingFacts(
			EMPTY_PROJECTION,
			workspace({
				taskings: {
					onTrack: row(),
					overdue: row({ suspenseOn: '2026-05-09' }),
					blocked: row({ status: 'blocked' }),
					short: row({ picked: 1 }),
					unsized: row({ picked: 0, required: null }),
					doneLate: row({ status: 'completed', suspenseOn: '2026-05-01' })
				}
			}),
			TODAY
		);

		expect(facts.needAction).toBe(3);
		expect(Object.keys(facts.taskings).sort()).toEqual(['blocked', 'onTrack', 'overdue', 'short', 'unsized']);
	});

	it('keeps the summaries of the Events in the range only', () => {
		const facts = calendarTaskingFacts(
			{ ...EMPTY_PROJECTION, events: [event()] },
			workspace({ events: { [ids.event]: summary(), [ids.other]: summary({ total: 4 }) } }),
			TODAY
		);

		expect(facts.events).toEqual({ [ids.event]: summary() });
	});
});

describe('mergeTaskingFacts', () => {
	it('takes the newest Taskings and count and keeps Event summaries from other ranges', () => {
		const earlier = { taskings: { gone: row() }, events: { [ids.other]: summary() }, needAction: 4 };
		const next = { taskings: { kept: row() }, events: { [ids.event]: summary({ total: 3 }) }, needAction: 1 };

		expect(mergeTaskingFacts(earlier, next)).toEqual({
			taskings: { kept: row() },
			events: { [ids.other]: summary(), [ids.event]: summary({ total: 3 }) },
			needAction: 1
		});
	});
});

describe('readCalendarProjection', () => {
	const range = { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' };
	const readerOf = (
		read: CalendarProjectionReader['read'],
		readWorkspace = vi.fn().mockResolvedValue(workspace())
	) => ({
		calendarProjection: { read },
		taskingWorkspace: { read: readWorkspace },
		disabledFeatures: []
	});

	it('returns what the reader allows with the Tasking facts of the same day', async () => {
		const read = vi.fn().mockResolvedValue({ ...EMPTY_PROJECTION, events: [event()] });
		const readWorkspace = vi.fn().mockResolvedValue(workspace({ events: { [ids.event]: summary() } }));

		const result = await readCalendarProjection(readerOf(read, readWorkspace), range, TODAY);

		expect(read).toHaveBeenCalledWith(range);
		expect(readWorkspace).toHaveBeenCalledWith(TODAY);
		expect(result).toEqual({
			kind: 'loaded',
			...EMPTY_PROJECTION,
			events: [event()],
			facts: { taskings: {}, events: { [ids.event]: summary() }, needAction: 0 }
		});
	});

	it('reads nothing while the switch is off', async () => {
		const read = vi.fn();
		const readWorkspace = vi.fn();

		const result = await readCalendarProjection(
			{
				calendarProjection: { read },
				taskingWorkspace: { read: readWorkspace },
				disabledFeatures: ['eventsAndTaskings']
			},
			range,
			TODAY
		);

		expect(read).not.toHaveBeenCalled();
		expect(readWorkspace).not.toHaveBeenCalled();
		expect(result).toEqual({ kind: 'loaded', ...EMPTY_PROJECTION, facts: EMPTY_TASKING_FACTS });
	});

	it('reports a failed read of either source as failed instead of throwing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = vi.fn().mockRejectedValue(new Error('boom'));

		expect(await readCalendarProjection(readerOf(failing), range, TODAY)).toEqual({ kind: 'failed' });
		expect(
			await readCalendarProjection(readerOf(vi.fn().mockResolvedValue(EMPTY_PROJECTION), failing), range, TODAY)
		).toEqual({ kind: 'failed' });
	});
});
