import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PoliciesSettingsSection from './PoliciesSettingsSection.svelte';

function renderSection(isReadinessGoalValid: boolean, isRetentionValid = true, isLossWarningValid = true) {
	const { body } = render(PoliciesSettingsSection, {
		props: {
			readinessGoalPercent: isReadinessGoalValid ? 80 : 120,
			hasRetentionChanges: false,
			isRetentionValid,
			hasLossWarningChanges: false,
			isLossWarningValid,
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
	const describe = (id: string) =>
		(doc.getElementById(id)!.getAttribute('aria-describedby') ?? '')
			.split(' ')
			.filter(Boolean)
			.map((describedBy) => doc.getElementById(describedBy)?.textContent?.trim());
	const goal = doc.getElementById('training-readiness-goal')!;
	return { doc, goal, descriptions: describe('training-readiness-goal'), describe };
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

	it.each([
		['retention-months', 'Must be between 1 and 120 months.', false, true],
		['loss-warning-window', 'Must be between 1 and 365 days.', true, false]
	] as const)('associates the %s error before hydration', (id, message, retentionValid, warningValid) => {
		const { doc, describe } = renderSection(true, retentionValid, warningValid);

		expect(describe(id)).toEqual([message]);
		expect(doc.getElementById(id)!.getAttribute('aria-invalid')).toBe('true');
	});

	it('names each Save after its policy section', () => {
		const { doc } = renderSection(true);

		expect(
			[...doc.querySelectorAll('button')].map((button) => button.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual(['Save Archive Retention', 'Save Loss Warning Window', 'Save Training Readiness']);
	});
});
