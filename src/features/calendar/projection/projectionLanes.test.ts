import { describe, expect, it } from 'vitest';
import type { LaneSegment } from '$features/calendar/utils/calendarLanes';
import type { EventsLaneSegment } from '$features/calendar/components/projection/EventsLaneSegment.svelte';
import { EMPTY_PROJECTION, EMPTY_TASKING_FACTS, type CalendarProjection } from './calendarProjection';
import { commitmentsByPerson } from './projectionCommitments';
import { buildProjectionLanes, suspenseDays, type ProjectionLinks } from './projectionLanes';

const links: ProjectionLinks = {
	events: '/events',
	event: (id) => `/events/${id}`,
	tasking: (id) => `/taskings/${id}`
};
const MAY = Array.from({ length: 31 }, (_, index) => new Date(2026, 4, index + 1));
const TODAY = '2026-05-10';

const event = (id: string, startsOn: string, endsOn: string, cancelled = false, host: string | null = null) => ({
	id,
	title: `Event ${id}`,
	startsOn,
	endsOn,
	cancelled,
	hasWork: false,
	host
});

function eventSegments(projection: CalendarProjection, facts = EMPTY_TASKING_FACTS) {
	const [events] = buildProjectionLanes({
		dates: MAY,
		region: { kind: 'ready', projection, facts },
		links,
		density: 'month',
		today: TODAY
	});
	if (events.track.shape !== 'span') throw new Error('Unexpected lane shape');
	return events.track.segments as readonly LaneSegment<EventsLaneSegment>[];
}

const placed = (segments: readonly LaneSegment<EventsLaneSegment>[]) =>
	segments.map((segment) => [segment.value.href, segment.value.row, segment.start, segment.end]);

describe('buildProjectionLanes', () => {
	it('draws a multi-day Event as one bar over its days, linked to its detail', () => {
		const segments = eventSegments({ ...EMPTY_PROJECTION, events: [event('a', '2026-05-04', '2026-05-06')] });

		expect(segments).toEqual([
			{
				start: 3,
				end: 5,
				value: expect.objectContaining({ href: '/events/a', row: 0, days: 3, continuesBefore: false, others: [] })
			}
		]);
	});

	it('keeps an Event that began before the range, clipped to the visible days', () => {
		const segments = eventSegments({ ...EMPTY_PROJECTION, events: [event('a', '2026-04-28', '2026-05-02')] });

		expect(segments).toEqual([{ start: 0, end: 1, value: expect.objectContaining({ continuesBefore: true }) }]);
	});

	it('drops an Event inside a longer one to the second row, whole', () => {
		const segments = eventSegments({
			...EMPTY_PROJECTION,
			events: [event('short', '2026-05-04', '2026-05-05'), event('long', '2026-05-01', '2026-05-10')]
		});

		expect(placed(segments)).toEqual([
			['/events/long', 0, 0, 9],
			['/events/short', 1, 3, 4]
		]);
	});

	it('offers the Events no row can hold from the second-row bar they overlap', () => {
		const segments = eventSegments({
			...EMPTY_PROJECTION,
			events: [
				event('a', '2026-05-04', '2026-05-06'),
				event('b', '2026-05-05', '2026-05-05'),
				event('c', '2026-05-05', '2026-05-07')
			]
		});

		expect(placed(segments)).toEqual([
			['/events/a', 0, 3, 5],
			['/events/c', 1, 4, 6]
		]);
		expect(segments[1].value.others.map((choice) => choice.key)).toEqual(['b']);
	});

	it('places a live Event before a cancelled one on the same day', () => {
		const segments = eventSegments({
			...EMPTY_PROJECTION,
			events: [event('x', '2026-05-04', '2026-05-04', true), event('y', '2026-05-04', '2026-05-04')]
		});

		expect(placed(segments)).toEqual([
			['/events/y', 0, 3, 3],
			['/events/x', 1, 3, 3]
		]);
	});

	it('marks the Events we host and carries their Tasking count', () => {
		const segments = eventSegments(
			{
				...EMPTY_PROJECTION,
				events: [
					event('ours', '2026-05-04', '2026-05-04'),
					event('theirs', '2026-05-08', '2026-05-08', false, '1st MDB')
				]
			},
			{
				...EMPTY_TASKING_FACTS,
				events: {
					ours: {
						total: 6,
						needAction: 2,
						overdue: 1,
						blocked: 1,
						needPeople: 0,
						fullyStaffedAndReady: 4,
						conflicts: 1
					}
				}
			}
		);

		expect(segments.map((segment) => [segment.value.hosted, segment.value.taskings])).toEqual([
			[true, 6],
			[false, 0]
		]);
	});

	it('keeps a Suspenses lane in the compact view only', () => {
		const lanesOf = (density: 'month' | 'compact') =>
			buildProjectionLanes({
				dates: MAY,
				region: { kind: 'ready', projection: EMPTY_PROJECTION, facts: EMPTY_TASKING_FACTS },
				links,
				density,
				today: TODAY
			}).map((lane) => lane.kind);

		expect(lanesOf('month')).toEqual(['events']);
		expect(lanesOf('compact')).toEqual(['events', 'suspenses']);
	});

	it.each([['loading' as const], ['error' as const]])('reserves the Events lane while %s', (kind) => {
		const lanes = buildProjectionLanes({ dates: MAY, region: { kind }, links, density: 'compact', today: TODAY });

		expect(lanes.map((lane) => [lane.kind, lane.track.shape])).toEqual([
			['events', 'status'],
			['suspenses', 'status']
		]);
	});

	it('offers the retry on the Events lane only', () => {
		const retry = () => {};
		const [events, suspenses] = buildProjectionLanes({
			dates: MAY,
			region: { kind: 'error', retry },
			links,
			density: 'compact',
			today: TODAY
		});

		expect(events.track).toMatchObject({ value: { kind: 'error', retry } });
		expect(suspenses.track).toMatchObject({ value: { kind: 'error', retry: undefined } });
	});
});

describe('suspenseDays', () => {
	const daysOf = (suspenses: CalendarProjection['suspenses']) =>
		suspenseDays({ dates: MAY, links, today: TODAY }, { ...EMPTY_PROJECTION, suspenses });

	it('puts a suspense on its day, opening its Tasking, and groups a shared day', () => {
		const days = daysOf([
			{ taskingId: 't1', title: 'Submit roster', suspenseOn: '2026-05-12', status: 'open' },
			{ taskingId: 't2', title: 'Inventory', suspenseOn: '2026-05-12', status: 'blocked' }
		]);

		expect(days[11].markers).toEqual([
			expect.objectContaining({ href: '/taskings/t1', target: { kind: 'tasking', id: 't1' } }),
			expect.objectContaining({ href: '/taskings/t2', target: { kind: 'tasking', id: 't2' } })
		]);
		expect(days.filter((day) => day.markers.length > 0)).toHaveLength(1);
	});

	it('marks the days before today as overdue', () => {
		const days = daysOf([]);

		expect(days[8].overdue).toBe(true);
		expect(days[9].overdue).toBe(false);
	});

	it('ignores a suspense outside the shown dates', () => {
		const days = daysOf([{ taskingId: 't1', title: 'Late', suspenseOn: '2026-06-02', status: 'open' }]);

		expect(days.every((day) => day.markers.length === 0)).toBe(true);
	});
});

describe('commitmentsByPerson', () => {
	const commitment = (taskingId: string, startsOn: string, endsOn: string, personnelId = 'p1') => ({
		taskingId,
		title: `Tasking ${taskingId}`,
		personnelId,
		conflicts: false,
		startsOn,
		endsOn
	});
	const byPerson = (commitments: ReturnType<typeof commitment>[]) =>
		commitmentsByPerson(commitments, '2026-05-01', 31, links);

	it('marks a Person only on the execution dates of the Tasking they are picked for', () => {
		const result = byPerson([commitment('t1', '2026-05-04', '2026-05-06')]);

		expect(result.get('p1')).toEqual([
			expect.objectContaining({ kind: 'tasking', start: 3, end: 5, href: '/taskings/t1' })
		]);
		expect(result.has('p2')).toBe(false);
	});

	it('shares a segment that opens a list only on the days Taskings overlap', () => {
		const segments = byPerson([
			commitment('t1', '2026-05-04', '2026-05-08'),
			commitment('t2', '2026-05-06', '2026-05-07')
		]).get('p1')!;

		expect(segments).toEqual([
			expect.objectContaining({ kind: 'tasking', start: 3, end: 4, href: '/taskings/t1', continuesAfter: true }),
			expect.objectContaining({
				kind: 'taskings',
				start: 5,
				end: 6,
				choices: [expect.objectContaining({ key: 't1' }), expect.objectContaining({ key: 't2' })]
			}),
			expect.objectContaining({ kind: 'tasking', start: 7, end: 7, href: '/taskings/t1', continuesBefore: true })
		]);
	});

	it('keeps each Person to their own commitments', () => {
		const result = byPerson([
			commitment('t1', '2026-05-04', '2026-05-06', 'p1'),
			commitment('t2', '2026-05-04', '2026-05-06', 'p2')
		]);

		expect(result.get('p1')).toHaveLength(1);
		expect(result.get('p2')).toEqual([expect.objectContaining({ href: '/taskings/t2' })]);
	});
});
