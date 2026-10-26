import { describe, expect, it } from 'vitest';
import {
	availabilityTargets,
	PREFILL_PEOPLE_LIMIT,
	readAvailabilityPrefill,
	setAvailabilityHref
} from './availabilityPrefill';
import type { TaskingPick } from './staffingModel';

const TASKING = '00000000-0000-4000-8000-000000000101';
const ALICE = '00000000-0000-4000-8000-000000000501';
const BRUNO = '00000000-0000-4000-8000-000000000502';
const ALPHA = '00000000-0000-4000-8000-000000000201';
const execution = { startsOn: '2030-10-19', endsOn: '2030-10-23' };

const query = (href: string) => new URL(href, 'https://app.test').searchParams;

describe('Set availability link', () => {
	it('is read back as the same people and dates', () => {
		const href = setAvailabilityHref('c-co', TASKING, execution, [ALICE, BRUNO]);

		expect(new URL(href, 'https://app.test').pathname).toBe('/org/c-co/calendar/bulk');
		expect(readAvailabilityPrefill(query(href))).toEqual({
			taskingId: TASKING,
			personnelIds: [ALICE, BRUNO],
			startDate: '2030-10-19',
			endDate: '2030-10-23'
		});
	});

	it('drops anything that is not a person id, and repeats', () => {
		const params = new URLSearchParams({
			tasking: TASKING,
			people: `${ALICE},not-an-id,,${ALICE},../../etc,${BRUNO}`,
			from: '2030-10-19',
			to: '2030-10-23'
		});

		expect(readAvailabilityPrefill(params)?.personnelIds).toEqual([ALICE, BRUNO]);
	});

	it.each([
		['a Tasking that is not an id', { tasking: 'javascript:alert(1)', from: '2030-10-19', to: '2030-10-23' }],
		['no Tasking', { from: '2030-10-19', to: '2030-10-23' }],
		['an impossible date', { tasking: TASKING, from: '2030-02-31', to: '2030-10-23' }],
		['an end before the start', { tasking: TASKING, from: '2030-10-23', to: '2030-10-19' }],
		['no dates', { tasking: TASKING }]
	])('is no prefill with %s', (_name, params) => {
		expect(readAvailabilityPrefill(new URLSearchParams({ people: ALICE, ...params }))).toBeNull();
	});

	it('carries a bounded number of people', () => {
		const many = Array.from(
			{ length: PREFILL_PEOPLE_LIMIT + 50 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
		);

		const read = readAvailabilityPrefill(query(setAvailabilityHref('c-co', TASKING, execution, many)));

		expect(read?.personnelIds).toEqual(many.slice(0, PREFILL_PEOPLE_LIMIT));
	});
});

describe('availabilityTargets', () => {
	const pick = (personnelId: string, overrides: Partial<TaskingPick> = {}): TaskingPick => ({
		personnelId,
		rank: 'SPC',
		firstName: 'Pat',
		lastName: 'Able',
		groupId: ALPHA,
		archived: false,
		selectedAt: '2030-10-01T00:00:00Z',
		reviewSince: null,
		...overrides
	});

	it('keeps picks that count among those the reader may write', () => {
		const targets = availabilityTargets(
			[
				pick(ALICE),
				pick(BRUNO, { groupId: null }),
				pick('review', { reviewSince: '2030-10-02T00:00:00Z' }),
				pick('archived', { archived: true })
			],
			(groupId) => groupId === ALPHA
		);

		expect(targets.map((target) => target.personnelId)).toEqual([ALICE]);
	});
});
