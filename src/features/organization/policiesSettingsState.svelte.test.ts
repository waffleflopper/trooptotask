import { describe, expect, it } from 'vitest';
import { createSettingsPoliciesState } from './policiesSettingsState.svelte';

describe('Organization policy state', () => {
	it('owns policy dirty and validity state from Policies section data', () => {
		const state = createSettingsPoliciesState({
			archiveRetention: { savedMonths: 36, constraints: { min: 1, max: 120, unit: 'months' } },
			lossWarning: { savedDays: 180, constraints: { min: 1, max: 365, unit: 'days' } },
			trainingReadinessGoal: { savedPercent: 90, constraints: { min: 1, max: 100, unit: 'percent' } },
			canUpdateRetention: true
		});

		expect(state.retentionMonths).toBe(36);
		expect(state.hasRetentionChanges).toBe(false);

		state.retentionMonths = 0;

		expect(state.hasRetentionChanges).toBe(true);
		expect(state.isRetentionValid).toBe(false);

		state.retentionMonths = 48;
		state.markRetentionSaved(48);

		expect(state.savedRetentionMonths).toBe(48);
		expect(state.hasRetentionChanges).toBe(false);
	});
});
