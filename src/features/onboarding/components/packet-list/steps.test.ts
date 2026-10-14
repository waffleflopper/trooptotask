// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { FinalStep } from '../../onboardingHistory';
import Steps from './steps.svelte';

afterEach(() => {
	cleanup();
});

function rows(steps: FinalStep[]): string[] {
	render(Steps, { props: { steps } });
	return within(screen.getByRole('list', { name: 'Final packet · read only' }))
		.getAllByRole('listitem')
		.map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('final packet steps', () => {
	it('shows the stage a paperwork step ended on, also after the step left the template', () => {
		expect(
			rows([
				{ id: 'a', name: 'Sign orders', done: false, removed: false, stage: 'Reviewed' },
				{ id: 'b', name: 'Legacy form', done: false, removed: true, stage: 'Reviewed' },
				{ id: 'c', name: 'Old waiver', done: true, removed: true, stage: 'Filed' }
			])
		).toEqual([
			'Open: Sign orders Reviewed',
			'Open: Legacy form Removed from template Reviewed',
			'Done: Old waiver Previously completed Filed'
		]);
	});

	it('says only that a removed step without stages left the template', () => {
		expect(
			rows([
				{ id: 'a', name: 'Legacy badge', done: false, removed: true, stage: null },
				{ id: 'b', name: 'Old briefing', done: true, removed: true, stage: null }
			])
		).toEqual(['Open: Legacy badge Removed from template', 'Done: Old briefing Previously completed']);
	});
});
