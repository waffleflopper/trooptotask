import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
		onboardingStore.load([], 'reset');
		onboardingStore.load([], 'org-1');
	});
	afterEach(() => vi.unstubAllGlobals());

	it.each([
		[
			'start',
			() => onboardingStore.startOnboarding('p-new', '2026-03-15', 'template-1'),
			{ ...mockOnboarding, id: 'ob-new', personnelId: 'p-new' }
		],
		['checkbox', () => onboardingStore.toggleCheckbox('step-1', true), { completed: true, currentStage: null }],
		['stage', () => onboardingStore.advanceStage('step-1', 'Filed'), { completed: true, currentStage: 'Filed' }],
		[
			'note',
			() => onboardingStore.addNote('step-1', 'Received'),
			{ notes: [{ text: 'Received', userId: 'u-1', timestamp: '2026-03-15T12:00:00Z' }] }
		],
		['remove', () => onboardingStore.removeDeprecatedStep('step-1'), { success: true }],
		['resync', () => onboardingStore.resync('ob-1'), { steps: [] }],
		['switch', () => onboardingStore.switchTemplate('ob-1', 'template-2'), { templateId: 'template-2', steps: [] }],
		['assign', () => onboardingStore.assignTemplate('ob-1', 'template-2'), { templateId: 'template-2', steps: [] }],
		[
			'cancel',
			() => onboardingStore.cancelOnboarding('ob-1'),
			{ status: 'cancelled', cancelledAt: '2026-03-15', completedAt: null }
		],
		[
			'complete',
			() => onboardingStore.completeOnboarding('ob-1'),
			{ status: 'completed', completedAt: '2026-03-15', cancelledAt: null }
		]
	] as const)(
		'ignores a late %s result after leaving and re-entering the organization',
		async (name, mutate, result) => {
			const original = {
				...mockOnboarding,
				templateId: name === 'assign' ? null : 'template-1',
				steps: [
					{
						...mockOnboarding.steps[0],
						stepType: name === 'stage' ? ('paperwork' as const) : ('checkbox' as const),
						stages: name === 'stage' ? ['Submitted', 'Reviewed', 'Filed'] : null,
						active: name !== 'remove'
					}
				]
			};
			onboardingStore.load([original], 'org-1');
			let respond!: (response: Response) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(
					() =>
						new Promise<Response>((resolve) => {
							respond = resolve;
						})
				)
			);
			const pending = mutate();
			// Entering B invalidates A immediately, even before B's workspace has loaded.
			onboardingStore.enterOrganization('org-2');
			const refreshed = { ...original, startedAt: '2026-03-16' };
			onboardingStore.load([refreshed], 'org-1');
			respond(Response.json(result));
			await pending;
			expect(onboardingStore.items).toEqual([refreshed]);
		}
	);

	it('ignores a start response whose body arrives after the organization changes', async () => {
		let body!: (packet: PersonnelOnboarding) => void;
		let reading!: () => void;
		const startedReading = new Promise<void>((resolve) => {
			reading = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => {
					reading();
					return new Promise<PersonnelOnboarding>((resolve) => {
						body = resolve;
					});
				}
			})
		);
		const pending = onboardingStore.startOnboarding('p-1', '2026-03-15', 'template-1');
		await startedReading;
		onboardingStore.enterOrganization('org-2');
		body(mockOnboarding);
		await expect(pending).resolves.toBeNull();
		expect(onboardingStore.items).toEqual([]);
	});

	it('should not clobber optimistic toggleCheckbox when load is called mid-flight', async () => {
		onboardingStore.load([mockOnboarding], 'org-1');

		let resolveFetch!: (value: unknown) => void;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValue(
				fetchPromise.then(() => ({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ completed: true, currentStage: null })
				}))
			)
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
				}).then(() => ({ ok: true, status: 200, json: () => Promise.resolve({ completed: true, currentStage: null }) }))
			)
		);

		const pending = onboardingStore.toggleCheckbox('step-1', true);

		// Different org — should go through
		onboardingStore.load([], 'org-2');
		expect(onboardingStore.items).toEqual([]);

		resolveFetch(undefined);
		await expect(pending).resolves.toBe(false);
		expect(onboardingStore.items).toEqual([]);
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

			resolveFetch({
				ok: true,
				status: 200,
				json: async () => ({ status: 'completed', completedAt: '2026-05-04', cancelledAt: null })
			});
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
