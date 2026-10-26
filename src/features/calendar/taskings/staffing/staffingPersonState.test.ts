import { describe, expect, it } from 'vitest';
import { staffingPersonState, type StaffingAdvisory } from './staffingModel';

const leave: StaffingAdvisory = {
	kind: 'availability',
	label: 'Leave',
	startsOn: '2030-10-21',
	endsOn: '2030-10-23',
	isConflict: true,
	overlapDays: 3,
	executionDays: 5
};

describe('a Person staffing state', () => {
	it('keeps failed checks and undated commitments unknown', () => {
		expect(staffingPersonState('person', { kind: 'failed' })).toEqual({ kind: 'unknown', reason: 'failed' });
		expect(staffingPersonState('person', { kind: 'no_execution' })).toEqual({
			kind: 'unknown',
			reason: 'no_execution'
		});
	});
	it('shows the dates and execution-day overlap for a conflicting status', () => {
		expect(staffingPersonState('person', { kind: 'loaded', byPerson: { person: [leave] } })).toEqual({
			kind: 'conflict',
			availability: [
				{
					kind: 'availability',
					label: 'Leave',
					startsOn: '2030-10-21',
					endsOn: '2030-10-23',
					isConflict: true,
					overlapDays: 3,
					executionDays: 5
				}
			]
		});
	});
	it('leaves own-tasking and available statuses clear', () => {
		expect(
			staffingPersonState('person', { kind: 'loaded', byPerson: { person: [{ ...leave, isConflict: false }] } })
		).toEqual({ kind: 'clear' });
	});
	it('keeps another commitment an advisory, with hidden work unnamed', () => {
		expect(
			staffingPersonState('person', { kind: 'loaded', byPerson: { person: [{ kind: 'committed_elsewhere' }] } })
		).toEqual({ kind: 'committed_elsewhere', commitments: [{ kind: 'committed_elsewhere' }] });
	});
	it('returns clear only after a successful check found nothing for this Person', () => {
		expect(staffingPersonState('person', { kind: 'loaded', byPerson: {} })).toEqual({ kind: 'clear' });
	});
});
