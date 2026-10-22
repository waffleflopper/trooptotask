import { describe, expect, it } from 'vitest';
import { statusEffectChangeText } from './rosterEffects';

const base = { assignmentTypeId: 'cq', rosterName: 'CQ', personId: 'kim', person: 'SGT Kim' } as const;

describe('statusEffectChangeText', () => {
	it('names the number that moves on a single-track form', () => {
		expect(statusEffectChangeText({ ...base, track: 'all', change: { kind: 'number', from: 11, to: 9 } })).toBe(
			'SGT Kim 11 → 9 on the CQ DA 6'
		);
	});

	it('names the earlier days and the track of a separate count', () => {
		expect(statusEffectChangeText({ ...base, track: 'all', change: { kind: 'earlier', days: 3 } })).toBe(
			'SGT Kim: 3 earlier days change on the CQ DA 6'
		);
		expect(statusEffectChangeText({ ...base, track: 'weekend', change: { kind: 'earlier', days: 1 } })).toBe(
			'SGT Kim: 1 earlier day changes on the CQ DA 6 (weekends and holidays)'
		);
		expect(statusEffectChangeText({ ...base, track: 'all', change: { kind: 'days', days: 2 } })).toBe(
			'SGT Kim: 2 days change on the CQ DA 6'
		);
		expect(statusEffectChangeText({ ...base, track: 'all', change: { kind: 'days', days: 1 } })).toBe(
			'SGT Kim: 1 day changes on the CQ DA 6'
		);
		expect(statusEffectChangeText({ ...base, track: 'weekday', change: { kind: 'number', from: 4, to: 6 } })).toBe(
			'SGT Kim 4 → 6 on the CQ DA 6 (weekdays)'
		);
	});
});
