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
	cancelledAt: null,
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
			notes: [],
			active: true
		}
	]
};

describe('onboardingStore - load during in-flight mutations (issue #113)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		onboardingStore.load([], 'org-1');
	});

	it('should not clobber optimistic toggleCheckbox when load is called mid-flight', async () => {
		onboardingStore.load([mockOnboarding], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(fetchPromise.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) })))
		);

		const updatePromise = onboardingStore.toggleCheckbox('step-1', true);

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

		onboardingStore.toggleCheckbox('step-1', true);

		// Different org — should go through
		onboardingStore.load([], 'org-2');
		expect(onboardingStore.items).toEqual([]);

		resolveFetch(undefined);
	});

	it('includes the selected start date when creating an onboarding', async () => {
		onboardingStore.load([], 'org-1');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockOnboarding)
			})
		);

		await onboardingStore.startOnboarding('p-1', '2026-03-15', 'template-1');

		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/onboarding', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ personnelId: 'p-1', templateId: 'template-1', startedAt: '2026-03-15' })
		});
	});

	it('uses the local calendar date for optimistic completion', async () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Anchorage';
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));
		onboardingStore.load([mockOnboarding], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				new Promise((resolve) => {
					resolveFetch = resolve;
				})
			)
		);

		try {
			const updatePromise = onboardingStore.completeOnboarding('ob-1');

			expect(onboardingStore.getById('ob-1')).toMatchObject({
				status: 'completed',
				completedAt: '2026-05-04'
			});
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/onboarding', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'ob-1', status: 'completed', completedAt: '2026-05-04' })
			});

			resolveFetch({ ok: true, status: 200 });
			await expect(updatePromise).resolves.toBe(true);
		} finally {
			vi.useRealTimers();
			if (originalTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimezone;
			}
		}
	});
});
