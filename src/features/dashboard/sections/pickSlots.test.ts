import { describe, expect, it } from 'vitest';
import type { StaffingPicker, TaskingPick } from '$features/calendar';
import {
	availabilityNote,
	confirmLabel,
	pickPeople,
	planPickSlots,
	slotNote,
	slotOptions,
	type PickSwap
} from './pickSlots';

const GRADERS = 'Provide 3 lane graders (E-6+)';

function pick(personnelId: string, lastName: string): TaskingPick {
	return {
		personnelId,
		rank: 'SFC',
		firstName: 'Dana',
		lastName,
		groupId: 'g-hq',
		archived: false,
		selectedAt: '2026-10-19T00:00:00Z',
		reviewSince: null
	};
}

const candidate = (personnelId: string, lastName: string, rank = 'SSG') => ({
	personnelId,
	rank,
	firstName: 'Lee',
	lastName,
	groupId: 'g-alpha'
});

const leave = {
	kind: 'conflict' as const,
	availability: [
		{
			kind: 'availability' as const,
			label: 'Leave',
			startsOn: '2026-10-20',
			endsOn: '2026-10-30',
			isConflict: true,
			overlapDays: 4,
			executionDays: 5
		}
	]
};

function picker(overrides: Partial<StaffingPicker> = {}): StaffingPicker {
	return {
		tasking: {
			requirement: { count: 3, qualifications: 'E-6 or above' },
			execution: { startsOn: '2026-10-19', endsOn: '2026-10-23', reportTime: '06:30' }
		},
		staffing: { revision: 4, picked: 1, needsReview: 0, outsideScope: 0, picks: [pick('p-novak', 'Novak')] },
		candidates: [
			candidate('p-novak', 'Novak', 'SFC'),
			candidate('p-okafor', 'Okafor', 'SGT'),
			candidate('p-moreno', 'Moreno'),
			candidate('p-hale', 'Hale'),
			candidate('p-ames', 'Ames'),
			candidate('p-able', 'Able', 'SPC')
		],
		advisories: { kind: 'loaded', byPerson: {} },
		states: {
			'p-novak': { kind: 'clear' },
			'p-okafor': leave,
			'p-moreno': { kind: 'clear' },
			'p-hale': { kind: 'clear' },
			'p-ames': { kind: 'committed_elsewhere', commitments: [{ kind: 'committed_elsewhere' }] },
			'p-able': { kind: 'clear' }
		},
		...overrides
	};
}

describe('planPickSlots', () => {
	it('keeps the people already picked and fills each open slot with the next person free all week at E-6 or above', () => {
		const plan = planPickSlots(picker(), GRADERS, null, new Map());

		expect(plan.slots.map(({ label, personnelId }) => [label, personnelId])).toEqual([
			['Selected', 'p-novak'],
			['Grader 2', 'p-hale'],
			['Grader 3', 'p-moreno']
		]);
		expect(plan.selection).toEqual(['p-novak', 'p-hale', 'p-moreno']);
		expect(plan.changed).toBe(2);
	});

	it('takes a person the viewer chose even when they are on leave, and suggests around them', () => {
		const plan = planPickSlots(picker(), GRADERS, null, new Map([['open:0', 'p-okafor']]));

		expect(plan.selection).toEqual(['p-novak', 'p-okafor', 'p-hale']);
		expect(availabilityNote(picker(), 'p-okafor')).toEqual({ text: 'Leave 4 of 5 days', warning: true });
	});

	it('opens the conflicting person’s slot for a replacement and keeps every other pick', () => {
		const swap: PickSwap = {
			personnelId: 'p-okafor',
			personLabel: 'SGT Okafor',
			statusLabel: 'Leave',
			startsOn: '2026-10-20'
		};
		const staffing = {
			revision: 4,
			picked: 3,
			needsReview: 0,
			outsideScope: 0,
			picks: [pick('p-novak', 'Novak'), pick('p-okafor', 'Okafor'), pick('p-moreno', 'Moreno')]
		};

		const plan = planPickSlots(picker({ staffing }), GRADERS, swap, new Map());

		expect(
			plan.slots.map(({ label, saved, personnelId, swap: marked }) => [label, saved, personnelId, marked])
		).toEqual([
			['Selected', 'p-novak', 'p-novak', false],
			['Selected', 'p-moreno', 'p-moreno', false],
			['Grader 3', 'p-okafor', 'p-hale', true]
		]);
		expect(plan.selection).toEqual(['p-novak', 'p-moreno', 'p-hale']);
		expect(plan.changed).toBe(1);
	});

	it('names slots by position and suggests in name order when nothing states a role or a grade', () => {
		const tasking = { ...picker().tasking, requirement: { count: 3, qualifications: '68W' } };

		const plan = planPickSlots(picker({ tasking }), 'Range coverage', null, new Map());

		expect(plan.slots.map(({ label, personnelId }) => [label, personnelId])).toEqual([
			['Selected', 'p-novak'],
			['Person 2', 'p-able'],
			['Person 3', 'p-hale']
		]);
		expect(confirmLabel('Range coverage', 3, 2)).toBe('Confirm 2 people');
	});

	it('suggests nobody when conflicts could not be checked', () => {
		const states = { 'p-hale': { kind: 'unknown' as const, reason: 'failed' as const } };
		const plan = planPickSlots(picker({ advisories: { kind: 'failed' }, states }), GRADERS, null, new Map());

		expect(plan.slots.slice(1).map((slot) => slot.personnelId)).toEqual([null, null]);
		expect(plan.changed).toBe(0);
	});

	it('draws four open slots of a bigger requirement and leaves the rest to the full picker', () => {
		const tasking = { requirement: { count: 7, qualifications: null }, execution: null };

		const advisories = { kind: 'no_execution' as const };

		const plan = planPickSlots(picker({ tasking, advisories, states: {} }), 'Provide 7 medics', null, new Map());

		expect(plan.slots.map((slot) => slot.label)).toEqual(['Medic 2', 'Medic 3', 'Medic 4', 'Medic 5']);
		expect(plan.hidden).toBe(2);
		expect(plan.selection).toEqual(['p-novak']);
	});
});

describe('slotOptions', () => {
	it('offers everyone the save would not already name, free people first and the conflicting last', () => {
		const plan = planPickSlots(picker(), GRADERS, null, new Map());

		const options = slotOptions(picker(), plan, plan.slots[1]);

		expect(options.map((person) => person.personnelId)).toEqual(['p-able', 'p-hale', 'p-ames', 'p-okafor']);
	});
});

describe('slotNote', () => {
	it('names a kept pick by Group and anyone else by availability, and never hides a conflict', () => {
		const people = pickPeople(picker());
		const groups = { 'g-hq': 'HQ', 'g-alpha': 'Alpha' };

		expect(slotNote(picker(), people.get('p-novak')!, groups, true)).toEqual({ text: 'E-7 · HQ', warning: false });
		expect(slotNote(picker(), people.get('p-hale')!, groups, false)).toEqual({
			text: 'E-6 · free all 5 days',
			warning: false
		});
		expect(slotNote(picker(), people.get('p-okafor')!, groups, true)).toEqual({
			text: 'E-5 · Leave 4 of 5 days',
			warning: true
		});
	});
});
