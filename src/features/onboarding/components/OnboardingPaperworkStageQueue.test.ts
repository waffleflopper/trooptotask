// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingPaperworkStageQueue from './OnboardingPaperworkStageQueue.svelte';
import type { OnboardingStepProgress } from '../onboarding.types';

function makePaperworkStep(overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	return {
		id: 'step-1',
		onboardingId: 'onboarding-1',
		stepName: 'Finance packet',
		stepType: 'paperwork',
		trainingTypeId: null,
		stages: ['Submitted', 'Review', 'Filed'],
		sortOrder: 1,
		completed: false,
		currentStage: 'Review',
		notes: [],
		templateStepId: 'template-step-1',
		active: true,
		...overrides
	};
}

describe('OnboardingPaperworkStageQueue', () => {
	afterEach(() => {
		cleanup();
	});

	it('labels the stage group and classifies cleared, current, and queued stages', () => {
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep(),
				canManage: true,
				onSelect: vi.fn()
			}
		});

		const group = screen.getByRole('group', { name: 'Finance packet paperwork stages' });

		expect(within(group).getByRole('button', { name: /Submitted Cleared/ })).toBeTruthy();
		expect(within(group).getByRole('button', { name: /Review Current/ })).toBeTruthy();
		expect(within(group).getByRole('button', { name: /Filed Queued/ })).toBeTruthy();
	});

	it('treats a missing current stage as the first active stage', () => {
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep({ currentStage: null }),
				canManage: true,
				onSelect: vi.fn()
			}
		});

		const group = screen.getByRole('group', { name: 'Finance packet paperwork stages' });

		expect(within(group).getByRole('button', { name: /Submitted Current/ })).toBeTruthy();
		expect(within(group).getByRole('button', { name: /Review Queued/ })).toBeTruthy();
	});

	it('does not fake a current stage when saved progress points at an unknown stage', () => {
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep({ currentStage: 'Archived review' }),
				canManage: true,
				onSelect: vi.fn()
			}
		});

		const group = screen.getByRole('group', { name: 'Finance packet paperwork stages' });

		expect(within(group).queryByRole('button', { name: /Current/ })).toBeNull();
		expect(within(group).getByRole('button', { name: /Submitted Queued/ })).toBeTruthy();
		expect(within(group).getByRole('button', { name: /Review Queued/ })).toBeTruthy();
	});

	it('disables all stages when the user cannot manage the onboarding', async () => {
		const onSelect = vi.fn();
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep(),
				canManage: false,
				onSelect
			}
		});

		const group = screen.getByRole('group', { name: 'Finance packet paperwork stages' });
		const submitted = within(group).getByRole('button', { name: /Submitted Cleared/ });

		expect(submitted.hasAttribute('disabled')).toBe(true);
		await fireEvent.click(submitted);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('selects an enabled active-stage button', async () => {
		const onSelect = vi.fn();
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep(),
				canManage: true,
				onSelect
			}
		});

		const group = screen.getByRole('group', { name: 'Finance packet paperwork stages' });
		await fireEvent.click(within(group).getByRole('button', { name: /Filed Queued/ }));

		expect(onSelect).toHaveBeenCalledWith('Filed');
	});

	it('supports the completed-step rollback path', async () => {
		const onSelect = vi.fn();
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep({ completed: true, currentStage: 'Filed' }),
				canManage: true,
				inset: false,
				onSelect
			}
		});

		const group = screen.getByRole('group', { name: 'Finance packet paperwork stages' });

		await fireEvent.click(within(group).getByRole('button', { name: /Review Cleared/ }));

		expect(onSelect).toHaveBeenCalledWith('Review');
	});

	it('renders no stage group when the paperwork step has no stages', () => {
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep({ stages: [] }),
				canManage: true,
				onSelect: vi.fn()
			}
		});

		expect(screen.queryByRole('group', { name: 'Finance packet paperwork stages' })).toBeNull();
	});

	it('renders no stage group when stages are null', () => {
		render(OnboardingPaperworkStageQueue, {
			props: {
				step: makePaperworkStep({ stages: null }),
				canManage: true,
				onSelect: vi.fn()
			}
		});

		expect(screen.queryByRole('group', { name: 'Finance packet paperwork stages' })).toBeNull();
	});
});
