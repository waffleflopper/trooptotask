import { describe, expect, it } from 'vitest';
import { eventDateRange, eventDraftSchema, eventPhase, parseSourceReference } from './eventModel';

const COORDINATOR = '00000000-0000-4000-8000-000000000001';
const draft = {
	title: 'Best Medic Competition',
	startsOn: '2026-10-19',
	endsOn: '2026-10-23',
	host: { kind: 'external', name: '1-1 BN' },
	coordinatorUserId: COORDINATOR,
	location: null,
	description: null,
	sourceReference: null
};

describe('eventPhase', () => {
	it.each([
		['2026-10-18', 'upcoming'],
		['2026-10-19', 'ongoing'],
		['2026-10-23', 'ongoing'],
		['2026-10-24', 'past']
	] as const)('on %s a 19-23 Oct event is %s', (today, phase) => {
		expect(eventPhase({ startsOn: '2026-10-19', endsOn: '2026-10-23' }, today)).toBe(phase);
	});

	it('treats a one-day event as ongoing only on its day', () => {
		const day = { startsOn: '2026-11-11', endsOn: '2026-11-11' };
		expect([eventPhase(day, '2026-11-10'), eventPhase(day, '2026-11-11'), eventPhase(day, '2026-11-12')]).toEqual([
			'upcoming',
			'ongoing',
			'past'
		]);
	});
});

describe('eventDateRange', () => {
	it.each([
		['2026-10-19', '2026-10-19', '19 Oct 2026'],
		['2026-10-19', '2026-10-23', '19 – 23 Oct 2026'],
		['2026-10-28', '2026-11-02', '28 Oct – 2 Nov 2026'],
		['2026-12-30', '2027-01-02', '30 Dec 2026 – 2 Jan 2027']
	])('reads %s to %s as %s', (startsOn, endsOn, expected) => {
		expect(eventDateRange({ startsOn, endsOn })).toBe(expected);
	});
});

describe('parseSourceReference', () => {
	it.each([
		['BN FRAGO 27-012', { kind: 'order', text: 'BN FRAGO 27-012' }],
		['OPORD: 23-01', { kind: 'order', text: 'OPORD: 23-01' }],
		['https://army.example/orders/27-012', { kind: 'link', url: 'https://army.example/orders/27-012' }],
		['HTTP://army.example', { kind: 'link', url: 'HTTP://army.example' }],
		['javascript:alert(1)', null],
		['data:text/html,hi', null],
		['ftp://army.example/order', null],
		['http://army example', null]
	])('reads %j', (value, expected) => {
		expect(parseSourceReference(value)).toEqual(expected);
	});
});

describe('eventDraftSchema', () => {
	it('accepts a one-day event and stores blank optional context as missing', () => {
		const parsed = eventDraftSchema.parse({
			...draft,
			endsOn: draft.startsOn,
			title: '  Range day  ',
			location: '   ',
			sourceReference: ''
		});
		expect(parsed).toMatchObject({
			title: 'Range day',
			startsOn: '2026-10-19',
			endsOn: '2026-10-19',
			location: null,
			sourceReference: null
		});
	});

	it('refuses an end before the start, an unsafe link and a blank external host', () => {
		const issues = (input: object) =>
			eventDraftSchema.safeParse({ ...draft, ...input }).error?.issues.map((issue) => issue.path.join('.'));
		expect(issues({ endsOn: '2026-10-18' })).toEqual(['endsOn']);
		expect(issues({ sourceReference: 'javascript:alert(1)' })).toEqual(['sourceReference']);
		expect(issues({ host: { kind: 'external', name: ' ' } })).toEqual(['host.name']);
	});
});

it('offers coordinators in label order with their account IDs', async () => {
	const { memberOptions } = await import('./eventModel');
	expect(memberOptions({ z: 'CPT Zed Brown', a: 'SFC Dana Whitaker' })).toEqual([
		{ userId: 'a', label: 'SFC Dana Whitaker' },
		{ userId: 'z', label: 'CPT Zed Brown' }
	]);
});
