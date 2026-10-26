import { describe, expect, it } from 'vitest';
import type { LaneSegment } from '$features/calendar/utils/calendarLanes';
import type { EventsLaneSegment } from '$features/calendar/components/projection/EventsLaneSegment.svelte';
import { EMPTY_PROJECTION, type CalendarProjection } from './calendarProjection';
import { commitmentsByPerson } from './projectionCommitments';
import { buildProjectionLanes, type ProjectionLinks } from './projectionLanes';

const links: ProjectionLinks = { event: (id) => `/events/${id}`, tasking: (id) => `/taskings/${id}` };
const MAY = Array.from({ length: 31 }, (_, index) => new Date(2026, 4, index + 1));

const event = (id: string, startsOn: string, endsOn: string, cancelled = false) => ({
	id,
	title: `Event ${id}`,
	startsOn,
	endsOn,
	cancelled
});

function lanesFor(projection: CalendarProjection, density: 'month' | 'compact' = 'month') {
	const [events, suspenses] = buildProjectionLanes({
		dates: MAY,
		region: { kind: 'ready', projection },
		links,
		density
	});
	if (events.track.shape !== 'span' || suspenses.track.shape !== 'day') throw new Error('Unexpected lane shapes');
	return {
		events,
		suspenses,
		segments: events.track.segments as readonly LaneSegment<EventsLaneSegment>[],
		days: suspenses.track.days as { markers: unknown[] }[]
	};
}

describe('buildProjectionLanes', () => {
	it('draws a multi-day Event as one segment over its days, linked to its detail', () => {
		const { segments } = lanesFor({ ...EMPTY_PROJECTION, events: [event('a', '2026-05-04', '2026-05-06')] });

		expect(segments).toEqual([
			{
				start: 3,
				end: 5,
				value: expect.objectContaining({ href: '/events/a', days: 3, continuesBefore: false, others: [] })
			}
		]);
	});

	it('keeps an Event that began before the range, clipped to the visible days', () => {
		const { segments } = lanesFor({ ...EMPTY_PROJECTION, events: [event('a', '2026-04-28', '2026-05-02')] });

		expect(segments).toEqual([{ start: 0, end: 1, value: expect.objectContaining({ continuesBefore: true }) }]);
	});

	it('lists the Events behind the visible one on its segment, never as extra segments', () => {
		const { segments } = lanesFor({
			...EMPTY_PROJECTION,
			events: [
				event('a', '2026-05-04', '2026-05-06'),
				event('b', '2026-05-05', '2026-05-05'),
				event('c', '2026-05-05', '2026-05-05')
			]
		});

		const behind = segments.flatMap((segment) => segment.value.others.map((item) => item.key));
		expect(new Set(behind)).toEqual(new Set(['a', 'c']));
		expect(segments.every((segment) => segment.end >= segment.start)).toBe(true);
		const days = segments.flatMap((segment) =>
			Array.from({ length: segment.end - segment.start + 1 }, (_, i) => segment.start + i)
		);
		expect(new Set(days).size).toBe(days.length);
	});

	it('lets a short Event stand out inside a long one, which shows around it', () => {
		const { segments } = lanesFor({
			...EMPTY_PROJECTION,
			events: [event('long', '2026-05-01', '2026-05-10'), event('short', '2026-05-04', '2026-05-05')]
		});

		expect(segments.map((segment) => [segment.value.href, segment.start, segment.end])).toEqual([
			['/events/long', 0, 2],
			['/events/short', 3, 4],
			['/events/long', 5, 9]
		]);
		expect(segments[1].value.others.map((item) => item.key)).toEqual(['long']);
	});

	it('lets a live Event take the day a cancelled one also covers', () => {
		const { segments } = lanesFor({
			...EMPTY_PROJECTION,
			events: [event('x', '2026-05-04', '2026-05-04', true), event('y', '2026-05-04', '2026-05-04')]
		});

		expect(segments[0].value).toMatchObject({ href: '/events/y', others: [{ key: 'x' }] });
	});

	it('puts a suspense on its day as a marker routed to the Tasking, and groups a shared day', () => {
		const { days } = lanesFor({
			...EMPTY_PROJECTION,
			suspenses: [
				{ taskingId: 't1', title: 'Submit roster', suspenseOn: '2026-05-10', status: 'open' },
				{ taskingId: 't2', title: 'Inventory', suspenseOn: '2026-05-10', status: 'blocked' }
			]
		});

		expect(days[9].markers).toEqual([
			expect.objectContaining({ key: 't1', href: '/taskings/t1', label: expect.stringContaining('Submit roster') }),
			expect.objectContaining({ key: 't2', href: '/taskings/t2', label: expect.stringContaining('Inventory') })
		]);
		expect(days.filter((day) => day.markers.length > 0)).toHaveLength(1);
	});

	it('ignores a suspense outside the shown dates', () => {
		const { days } = lanesFor({
			...EMPTY_PROJECTION,
			suspenses: [{ taskingId: 't1', title: 'Late', suspenseOn: '2026-06-02', status: 'open' }]
		});

		expect(days.every((day) => day.markers.length === 0)).toBe(true);
	});

	it.each([['loading' as const], ['error' as const]])('reserves both lanes while %s', (kind) => {
		const lanes = buildProjectionLanes({ dates: MAY, region: { kind }, links, density: 'month' });

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
			density: 'month'
		});

		expect(events.track).toMatchObject({ value: { kind: 'error', retry } });
		expect(suspenses.track).toMatchObject({ value: { kind: 'error', retry: undefined } });
	});
});

describe('commitmentsByPerson', () => {
	const commitment = (taskingId: string, startsOn: string, endsOn: string, personnelId = 'p1') => ({
		taskingId,
		title: `Tasking ${taskingId}`,
		personnelId,
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
				items: [expect.objectContaining({ key: 't1' }), expect.objectContaining({ key: 't2' })]
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
