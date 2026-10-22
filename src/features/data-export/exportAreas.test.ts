import { describe, expect, it } from 'vitest';
import { exportScopeChips } from './exportAreas';

const COUNTS = { activePersonnel: 12, trainingRecords: 1 };

describe('export scope chips', () => {
	it('list every area while all features are on', () => {
		expect(exportScopeChips(COUNTS, [])).toEqual([
			'Calendar',
			'Personnel · 12',
			'Training · 1 record',
			'Onboarding',
			'Sign-in rosters'
		]);
	});

	it('drop Training and the sign-in rosters it covers while Training is off', () => {
		expect(exportScopeChips(COUNTS, ['training'])).toEqual(['Calendar', 'Personnel · 12', 'Onboarding']);
	});

	it('drop Onboarding while it is off and keep the rest', () => {
		expect(exportScopeChips(null, ['onboarding'])).toEqual(['Calendar', 'Personnel', 'Training', 'Sign-in rosters']);
	});

	it('keep every chip for features that do not change what an export lists', () => {
		expect(exportScopeChips(COUNTS, ['criticalTasks', 'evaluations', 'lossesAndAwards'])).toHaveLength(5);
	});
});
