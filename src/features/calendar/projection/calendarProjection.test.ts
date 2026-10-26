import { describe, expect, it, vi } from 'vitest';
import {
	calendarProjectionSchema,
	EMPTY_PROJECTION,
	mergeProjections,
	replaceProjectionRange,
	type ProjectedCommitment,
	type ProjectedEvent
} from './calendarProjection';
import { readCalendarProjection, type CalendarProjectionReader } from './calendarProjectionRead.server';

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

describe('readCalendarProjection', () => {
	const range = { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' };
	const readerOf = (read: CalendarProjectionReader['read']) => ({ calendarProjection: { read }, disabledFeatures: [] });

	it('returns what the reader allows', async () => {
		const read = vi.fn().mockResolvedValue({ ...EMPTY_PROJECTION, events: [event()] });

		const result = await readCalendarProjection(readerOf(read), range);

		expect(read).toHaveBeenCalledWith(range);
		expect(result).toEqual({ kind: 'loaded', ...EMPTY_PROJECTION, events: [event()] });
	});

	it('reads nothing while the switch is off', async () => {
		const read = vi.fn();

		const result = await readCalendarProjection(
			{ calendarProjection: { read }, disabledFeatures: ['eventsAndTaskings'] },
			range
		);

		expect(read).not.toHaveBeenCalled();
		expect(result).toEqual({ kind: 'loaded', ...EMPTY_PROJECTION });
	});

	it('reports a failed read as failed instead of throwing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await readCalendarProjection(readerOf(vi.fn().mockRejectedValue(new Error('boom'))), range);

		expect(result).toEqual({ kind: 'failed' });
	});
});
