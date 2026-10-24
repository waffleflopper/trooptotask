import { describe, expect, it } from 'vitest';
import { parseRosterFilter, rosterFilterAnswerable, serializeRosterFilter } from './rosterFilter';
import { NO_SIGNAL_ACCESS, type SignalAccess } from './rosterSignals';

const TDY = { id: 'tdy', name: 'TDY', color: '#2563eb', textColor: '#fff', sortOrder: 0 };

function readsOnly(...sources: (keyof SignalAccess)[]): SignalAccess {
	return { ...NO_SIGNAL_ACCESS, ...Object.fromEntries(sources.map((source) => [source, true])) };
}

describe('roster filter in the address', () => {
	it.each([
		['expired', { kind: 'chip', chip: 'expired' }],
		['expiring', { kind: 'chip', chip: 'expiring' }],
		['follow-ups', { kind: 'chip', chip: 'follow-ups' }],
		['not-present', { kind: 'chip', chip: 'not-present' }],
		['losses', { kind: 'chip', chip: 'losses' }],
		['counseling', { kind: 'chip', chip: 'counseling' }],
		['present', { kind: 'present' }],
		['status:3f2a', { kind: 'status', statusTypeId: '3f2a' }]
	])('reads ?show=%s and writes it back unchanged', (value, filter) => {
		expect(parseRosterFilter(value)).toEqual(filter);
		expect(serializeRosterFilter(parseRosterFilter(value)!)).toBe(value);
	});

	it.each([null, '', 'everyone', 'Expired', 'status:', 'chip:expired'])('ignores %j', (value) => {
		expect(parseRosterFilter(value)).toBeNull();
	});
});

describe('whether the settled lane can answer a filter', () => {
	const lane = (access: SignalAccess, lossesEnabled = true) => ({ access, lossesEnabled, statusTypes: [TDY] });

	it('answers a chip only when a source behind it is read', () => {
		expect(rosterFilterAnswerable({ kind: 'chip', chip: 'follow-ups' }, lane(readsOnly('training')))).toBe(false);
		expect(rosterFilterAnswerable({ kind: 'chip', chip: 'follow-ups' }, lane(readsOnly('followUps')))).toBe(true);
		expect(rosterFilterAnswerable({ kind: 'chip', chip: 'expiring' }, lane(readsOnly('evaluations')))).toBe(true);
		expect(rosterFilterAnswerable({ kind: 'chip', chip: 'losses' }, lane(NO_SIGNAL_ACCESS, false))).toBe(false);
		expect(rosterFilterAnswerable({ kind: 'chip', chip: 'losses' }, lane(NO_SIGNAL_ACCESS, true))).toBe(true);
	});

	it('answers Present and a status type only for a viewer who reads availability, and only for a type the unit still has', () => {
		expect(rosterFilterAnswerable({ kind: 'present' }, lane(readsOnly('training')))).toBe(false);
		expect(rosterFilterAnswerable({ kind: 'present' }, lane(readsOnly('availability')))).toBe(true);
		expect(rosterFilterAnswerable({ kind: 'status', statusTypeId: 'tdy' }, lane(readsOnly('availability')))).toBe(true);
		expect(rosterFilterAnswerable({ kind: 'status', statusTypeId: 'gone' }, lane(readsOnly('availability')))).toBe(
			false
		);
	});
});
