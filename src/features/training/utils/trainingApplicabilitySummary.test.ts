import { describe, expect, it } from 'vitest';
import { summarizeTrainingApplicability } from './trainingApplicabilitySummary';

const everyone = {
	isOptional: false,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: []
};

describe('summarizeTrainingApplicability', () => {
	it.each([
		{ name: 'no rule', type: everyone, expected: 'Everyone' },
		{
			name: 'optional ignores every list',
			type: { ...everyone, isOptional: true, appliesToRoles: ['Driver'] },
			expected: 'Optional'
		},
		{ name: 'one role', type: { ...everyone, appliesToRoles: ['Driver'] }, expected: 'Role: Driver' },
		{
			name: 'several values of one kind',
			type: { ...everyone, appliesToMos: ['68W', '91B'] },
			expected: 'MOS: 68W, 91B'
		},
		{
			name: 'several kinds read as any-of',
			type: { ...everyone, appliesToRoles: ['Driver'], appliesToRanks: ['SGT'] },
			expected: 'Role: Driver · Rank: SGT'
		},
		{ name: 'an exception alone', type: { ...everyone, excludedMos: ['68W'] }, expected: 'Everyone except MOS 68W' },
		{
			name: 'exceptions of two kinds',
			type: { ...everyone, excludedMos: ['68W', '91B'], excludedRoles: ['Medic'] },
			expected: 'Everyone except Role Medic · MOS 68W, 91B'
		},
		{
			name: 'a rule with an exception',
			type: { ...everyone, appliesToRoles: ['Driver'], excludedMos: ['68W'] },
			expected: 'Role: Driver · except MOS 68W'
		}
	])('reads $name', ({ type, expected }) => {
		expect(summarizeTrainingApplicability(type)).toBe(expected);
	});
});
