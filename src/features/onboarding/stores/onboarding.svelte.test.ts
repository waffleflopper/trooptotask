import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onboardingStore } from './onboarding.svelte';
import type { PersonnelOnboarding } from '../onboarding.types';

const mockOnboarding: PersonnelOnboarding = {
	id: 'ob-1',
	personnelId: 'p-1',
	templateId: null,
	status: 'in_progress',
	startedAt: '2026-03-01',
	completedAt: null,
	steps: [
		{
			id: 'step-1',
			onboardingId: 'ob-1',
			templateStepId: null,
			stepName: 'Inprocess',
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 0,
			completed: false,
			currentStage: null,
			notes: []
		}
	]
};

describe('onboardingStore - load during in-flight mutations (issue #113)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		onboardingStore.load([], 'org-1');
	});

	it('should not clobber optimistic updateStepProgress when load is called mid-flight', async () => {
		onboardingStore.load([mockOnboarding], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(fetchPromise.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) })))
		);

		const updatePromise = onboardingStore.updateStepProgress('step-1', {
			completed: true,
			currentStage: 'completed'
		});

		// Optimistic: step should show completed
		const ob = onboardingStore.getById('ob-1');
		expect(ob?.steps[0].completed).toBe(true);

		// Stale load (step not completed)
		onboardingStore.load([mockOnboarding], 'org-1');

		// Should NOT clobber optimistic update
		const obAfterLoad = onboardingStore.getById('ob-1');
		expect(obAfterLoad?.steps[0].completed).toBe(true);

		resolveFetch(undefined);
		await updatePromise;
	});

	it('should allow load when org changes during in-flight mutation', async () => {
		onboardingStore.load([mockOnboarding], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				new Promise((resolve) => {
					resolveFetch = resolve;
				}).then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) }))
			)
		);

		onboardingStore.updateStepProgress('step-1', { completed: true, currentStage: 'completed' });

		// Different org — should go through
		onboardingStore.load([], 'org-2');
		expect(onboardingStore.list).toEqual([]);

		resolveFetch(undefined);
	});
});
