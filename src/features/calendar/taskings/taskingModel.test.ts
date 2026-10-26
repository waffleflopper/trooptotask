import { describe, expect, it } from 'vitest';
import {
	availableActions,
	filterTaskings,
	nextTaskingDate,
	parseTaskingFilters,
	taskingAttention,
	taskingDraftSchema,
	taskingFiltersQuery,
	DEFAULT_TASKING_FILTERS,
	type Tasking
} from './taskingModel';

const TODAY = '2026-10-25';
const EVENT = '00000000-0000-4000-8000-000000000301';
const ALPHA = '00000000-0000-4000-8000-000000000201';

function tasking(id: string, overrides: Partial<Tasking> = {}): Tasking {
	return {
		id,
		title: id,
		event: null,
		responsibility: { kind: 'organization' },
		suspenseOn: '2026-11-20',
		execution: null,
		requirement: null,
		instructions: null,
		status: { kind: 'open' },
		...overrides
	};
}

describe('Tasking attention', () => {
	it.each([
		['2026-10-24', 'overdue'],
		['2026-10-25', 'due_today'],
		['2026-11-01', 'due_soon'],
		['2026-11-02', null]
	])('reads a suspense of %s on 25 Oct as %s', (suspenseOn, expected) => {
		expect(taskingAttention(tasking('t', { suspenseOn }), TODAY)).toBe(expected);
	});

	it('keeps a blocked Tasking overdue and lets Completed and Cancelled ones leave attention', () => {
		const at = '2026-10-20T10:00:00Z';
		expect(
			taskingAttention(
				tasking('t', { suspenseOn: '2026-10-01', status: { kind: 'blocked', reason: 'x', at, by: null } }),
				TODAY
			)
		).toBe('overdue');
		expect(
			taskingAttention(
				tasking('t', { suspenseOn: '2026-10-01', status: { kind: 'completed', note: null, at, by: null } }),
				TODAY
			)
		).toBeNull();
		expect(
			taskingAttention(
				tasking('t', { suspenseOn: '2026-10-01', status: { kind: 'cancelled', reason: null, at, by: null } }),
				TODAY
			)
		).toBeNull();
	});
});

describe('the next relevant date', () => {
	it('shows when work starts while execution is still ahead of the suspense, and the suspense otherwise', () => {
		const execution = { startsOn: '2026-11-02', endsOn: '2026-11-06', reportTime: null };
		expect(nextTaskingDate(tasking('t', { execution, suspenseOn: '2026-11-06' }), TODAY)).toEqual({
			label: 'Starts',
			on: '2026-11-02'
		});
		expect(nextTaskingDate(tasking('t', { execution, suspenseOn: '2026-10-30' }), TODAY)).toEqual({
			label: 'Due',
			on: '2026-10-30'
		});
		expect(nextTaskingDate(tasking('t', { execution, suspenseOn: '2026-11-06' }), '2026-11-03')).toEqual({
			label: 'Due',
			on: '2026-11-06'
		});
	});
});

describe('Tasking actions', () => {
	it('offers only the moves the lifecycle allows', () => {
		expect(availableActions('open')).toEqual(['start', 'complete', 'block', 'cancel']);
		expect(availableActions('in_progress')).toEqual(['complete', 'block', 'cancel']);
		expect(availableActions('blocked')).toEqual(['unblock', 'complete', 'cancel']);
		expect(availableActions('completed')).toEqual(['reopen']);
		expect(availableActions('cancelled')).toEqual([]);
	});
});

describe('Tasking list filters', () => {
	it('round-trips every filter through the URL and leaves defaults out', () => {
		const filters = { view: 'overdue', event: EVENT, responsibility: ALPHA, within: '14', search: 'medics' } as const;
		const query = taskingFiltersQuery(filters);

		expect(parseTaskingFilters(new URLSearchParams(query))).toEqual(filters);
		expect(taskingFiltersQuery(DEFAULT_TASKING_FILTERS)).toBe('');
		expect(parseTaskingFilters(new URLSearchParams('view=bogus&within=9'))).toEqual(DEFAULT_TASKING_FILTERS);
	});

	it('narrows by view, Event, responsibility, date window and search, and sorts by the shown date', () => {
		const event = {
			id: EVENT,
			title: 'Best Medic Competition',
			startsOn: '2026-11-02',
			endsOn: '2026-11-06',
			cancelled: false
		};
		const list = [
			tasking('late', { suspenseOn: '2026-10-20' }),
			tasking('lanes', {
				event,
				responsibility: { kind: 'group', groupId: ALPHA },
				suspenseOn: '2026-11-06',
				execution: { startsOn: '2026-10-28', endsOn: '2026-11-06', reportTime: null }
			}),
			tasking('roster', { event, suspenseOn: '2026-10-27' }),
			tasking('far', { suspenseOn: '2026-12-20' })
		];
		const ids = (overrides: Partial<typeof DEFAULT_TASKING_FILTERS>) =>
			filterTaskings(list, { ...DEFAULT_TASKING_FILTERS, ...overrides }, TODAY).map((shown) => shown.id);

		expect(ids({})).toEqual(['late', 'roster', 'lanes', 'far']);
		expect(ids({ view: 'overdue' })).toEqual(['late']);
		expect(ids({ event: EVENT })).toEqual(['roster', 'lanes']);
		expect(ids({ event: 'standalone' })).toEqual(['late', 'far']);
		expect(ids({ responsibility: ALPHA })).toEqual(['lanes']);
		expect(ids({ responsibility: 'organization' })).toEqual(['late', 'roster', 'far']);
		expect(ids({ within: '7' })).toEqual(['roster', 'lanes']);
		expect(ids({ search: 'best medic' })).toEqual(['roster', 'lanes']);
	});
});

describe('the Tasking draft', () => {
	const draft = {
		title: ' Provide medics ',
		eventId: null,
		responsibility: { kind: 'organization' },
		suspenseOn: '2026-10-23',
		execution: null,
		requirement: null,
		instructions: '  '
	};

	it('trims text and turns blank optional text into nothing', () => {
		expect(taskingDraftSchema.parse(draft)).toMatchObject({ title: 'Provide medics', instructions: null });
	});

	it('refuses execution that ends before it starts, a report time that is not HH:MM, and a zero count', () => {
		expect(
			taskingDraftSchema.safeParse({
				...draft,
				execution: { startsOn: '2026-10-20', endsOn: '2026-10-19', reportTime: null }
			}).success
		).toBe(false);
		expect(
			taskingDraftSchema.safeParse({
				...draft,
				execution: { startsOn: '2026-10-19', endsOn: '2026-10-19', reportTime: '5:30' }
			}).success
		).toBe(false);
		expect(taskingDraftSchema.safeParse({ ...draft, requirement: { count: 0, qualifications: null } }).success).toBe(
			false
		);
	});

	it('needs responsibility to be named, never left empty', () => {
		expect(taskingDraftSchema.safeParse({ ...draft, responsibility: null }).success).toBe(false);
	});
});
