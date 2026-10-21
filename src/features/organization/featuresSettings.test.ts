import { describe, expect, it } from 'vitest';
import { FEATURE_ROWS, holdsLane, strengthFloorSentence, type FeatureCounts } from './featuresSettings';

const empty: FeatureCounts = {
	activePersonnel: 0,
	statusTypes: 0,
	trainingTypes: 0,
	trainingRecords: 0,
	criticalTaskLists: 0,
	ratingSchemeEntries: 0,
	onboardingTemplates: 0
};
const stocked: FeatureCounts = {
	activePersonnel: 22,
	statusTypes: 6,
	trainingTypes: 8,
	trainingRecords: 912,
	criticalTaskLists: 1,
	ratingSchemeEntries: 21,
	onboardingTemplates: 3
};

function lanes(counts: FeatureCounts, on: boolean) {
	return FEATURE_ROWS.map((row) => [row.label, row.holds && holdsLane(row.holds(counts), on)]);
}

describe('Features holds lanes', () => {
	it('lists the switchable features in the spec order with what each holds', () => {
		expect(lanes(stocked, true)).toEqual([
			['Training', { text: '8 types · 912 records', notSetUp: false }],
			['Critical tasks', { text: '1 task list', notSetUp: false }],
			['Evaluations', { text: '21 in rating scheme', notSetUp: false }],
			['Onboarding', { text: '3 templates', notSetUp: false }],
			['Losses and awards', null]
		]);
	});

	it('flags a feature that is on and holds nothing, and only names the gap when it is off', () => {
		expect(lanes(empty, true)).toEqual([
			['Training', { text: 'Not set up · no training types', notSetUp: true }],
			['Critical tasks', { text: 'Not set up · no task lists', notSetUp: true }],
			['Evaluations', { text: 'Not set up · no rating scheme', notSetUp: true }],
			['Onboarding', { text: 'Not set up · no templates', notSetUp: true }],
			['Losses and awards', null]
		]);
		expect(lanes(empty, false).slice(0, 2)).toEqual([
			['Training', { text: 'No training types', notSetUp: false }],
			['Critical tasks', { text: 'No task lists', notSetUp: false }]
		]);
	});
});

describe('strengthFloorSentence', () => {
	it.each([
		[80, 22, '80% of 22 is 17.6, so 17 or fewer available is flagged.'],
		[80, 40, '80% of 40 is 32, so 31 or fewer available is flagged.'],
		[80, 200, '80% of 200 is 160, so 158 or fewer available is flagged.'],
		[1, 22, '1% of 22 is 0.22, so the unit is flagged only when no one is available.'],
		[80, 0, 'No one is on the roster yet, so nothing is flagged.']
	])('states floor %i%% over %i people', (floor, people, sentence) => {
		expect(strengthFloorSentence(floor, people)).toBe(sentence);
	});
});
