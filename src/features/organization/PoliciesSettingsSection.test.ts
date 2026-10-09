import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PoliciesSettingsSection from './PoliciesSettingsSection.svelte';

function renderSection(isReadinessGoalValid: boolean) {
	const { body } = render(PoliciesSettingsSection, {
		props: {
			readinessGoalPercent: isReadinessGoalValid ? 80 : 120,
			hasRetentionChanges: false,
			isRetentionValid: true,
			hasLossWarningChanges: false,
			isLossWarningValid: true,
			hasReadinessGoalChanges: !isReadinessGoalValid,
			isReadinessGoalValid,
			savingRetention: false,
			savingWarningWindow: false,
			savingReadinessGoal: false,
			onSaveRetention: () => {},
			onSaveLossWarning: () => {},
			onSaveReadinessGoal: () => {}
		}
	});
	const doc = new Window().document;
	doc.body.innerHTML = body;
	const goal = doc.getElementById('training-readiness-goal')!;
	const descriptions = (goal.getAttribute('aria-describedby') ?? '')
		.split(' ')
		.filter(Boolean)
		.map((id) => doc.getElementById(id)?.textContent?.trim());
	return { goal, descriptions };
}

describe('PoliciesSettingsSection server render', () => {
	it('associates the readiness goal help before hydration', () => {
		const { goal, descriptions } = renderSection(true);

		expect(descriptions).toEqual(['Used for goal lines and heat-map bands on Training Reports.']);
		expect(goal.hasAttribute('aria-invalid')).toBe(false);
	});

	it('associates the readiness goal error before hydration', () => {
		const { goal, descriptions } = renderSection(false);

		expect(descriptions).toEqual([
			'Used for goal lines and heat-map bands on Training Reports.',
			'Must be a whole number between 1 and 100.'
		]);
		expect(goal.getAttribute('aria-invalid')).toBe('true');
	});
});
