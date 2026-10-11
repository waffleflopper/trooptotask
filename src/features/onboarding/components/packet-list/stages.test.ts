// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { Stages } from './index';

afterEach(() => {
	cleanup();
});

function stageItems() {
	return within(screen.getByRole('list', { name: 'Finance packet paperwork stages' })).getAllByRole('listitem');
}

describe('OnboardingPacketList.Stages', () => {
	it('renders an ordered list of numbered, non-interactive stages with the current stage marked', () => {
		render(Stages, {
			props: { stepName: 'Finance packet', stages: ['Drafted', 'Signed', 'Filed'], currentStage: 'Signed' }
		});

		expect(screen.getByText('Current stage: Signed')).toBeTruthy();
		const items = stageItems();
		expect(items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Step 1: Drafted',
			'Step 2: 2 Signed',
			'Step 3: 3 Filed'
		]);
		expect(screen.queryAllByRole('button')).toEqual([]);
		expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, 'step', null]);
	});

	it('shows the first stage as current when no stage is saved', () => {
		render(Stages, { props: { stepName: 'Finance packet', stages: ['Drafted', 'Signed'], currentStage: null } });

		expect(screen.getByText('Current stage: Drafted')).toBeTruthy();
		expect(stageItems().map((item) => item.getAttribute('aria-current'))).toEqual(['step', null]);
	});

	it('shows an unknown saved stage without marking any listed stage current', () => {
		render(Stages, { props: { stepName: 'Finance packet', stages: ['Drafted', 'Signed'], currentStage: 'Archived' } });

		expect(screen.getByText('Current stage: Archived')).toBeTruthy();
		expect(stageItems().map((item) => item.getAttribute('aria-current'))).toEqual([null, null]);
	});

	it('renders duplicate stage names with one current stage', () => {
		render(Stages, {
			props: { stepName: 'Finance packet', stages: ['Review', 'Signed', 'Review'], currentStage: 'Review' }
		});

		expect(stageItems().map((item) => item.getAttribute('aria-current'))).toEqual(['step', null, null]);
	});
});
