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

const paperworkOnboarding: PersonnelOnboarding = {
	...mockOnboarding,
	steps: [
		{
			...mockOnboarding.steps[0],
			stepType: 'paperwork',
			stages: ['Submitted', 'Reviewed', 'Filed'],
			currentStage: 'Submitted',
			notes: [{ text: 'Saved work', timestamp: '2026-10-01T12:00:00.000Z', userId: 'operator' }]
		}
	]
};

const checklistOnboarding: PersonnelOnboarding = {
	...mockOnboarding,
	templateId: 'template-a',
	steps: [
		{ ...mockOnboarding.steps[0], templateStepId: 'orientation-definition', stepName: 'Orientation' },
		{
			...paperworkOnboarding.steps[0],
			id: 'paperwork-2',
			templateStepId: 'paperwork-definition',
			stepName: 'Paperwork'
		}
	]
};

const reconciledSteps = [
	{
		...checklistOnboarding.steps[1],
		templateStepId: 'paperwork-definition',
		stepName: 'Updated Paperwork',
		sortOrder: 0,
		notes: [
			{ text: 'Fresh saved history', timestamp: '2026-10-01T13:00:00.000Z', userId: 'another-operator' },
			...checklistOnboarding.steps[1].notes
		]
	},
	{
		...checklistOnboarding.steps[0],
		templateStepId: 'orientation-definition',
		stepName: 'Updated Orientation',
		sortOrder: 1
	},
	{
		...mockOnboarding.steps[0],
		id: 'new-step',
		templateStepId: 'new-definition',
		stepName: 'New task',
		sortOrder: 2
	}
];

const resetStageSteps = [
	{ ...reconciledSteps[0], stages: ['Submitted', 'Reviewed'], currentStage: 'Submitted', completed: false },
	reconciledSteps[1],
	reconciledSteps[2]
];

function deferredResponse() {
	let respond!: (response: Response) => void;
	const promise = new Promise<Response>((resolve) => {
		respond = resolve;
	});
	return { promise, respond };
}

describe('onboardingStore - load during in-flight mutations (issue #113)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		onboardingStore.load([], 'reset');
		onboardingStore.load([], 'org-1');
	});
	afterEach(() => vi.unstubAllGlobals());

	it.each([200, 503])(
		'retains confirmed incomplete after an earlier checkbox completion returns %s last',
		async (status) => {
			onboardingStore.load([mockOnboarding], 'org-1');
			const completeResponse = deferredResponse();
			const incompleteResponse = deferredResponse();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValueOnce(completeResponse.promise).mockReturnValueOnce(incompleteResponse.promise)
			);
			const complete = onboardingStore.toggleCheckbox('step-1', true);
			const incomplete = onboardingStore.toggleCheckbox('step-1', false);
			expect(onboardingStore.getById('ob-1')).toEqual(mockOnboarding);

			incompleteResponse.respond(Response.json({ completed: false, currentStage: null }));
			await expect(incomplete).resolves.toBe(true);
			expect.soft(onboardingStore.getById('ob-1')).toEqual(mockOnboarding);

			completeResponse.respond(Response.json({ completed: true, currentStage: null }, { status }));
			await expect(complete).resolves.toBe(status === 200);
			expect(onboardingStore.getById('ob-1')).toEqual(mockOnboarding);
		}
	);

	it('keeps an earlier pending checkbox completion when the newer reversal fails and permits retry', async () => {
		onboardingStore.load([mockOnboarding], 'org-1');
		const completeResponse = deferredResponse();
		const incompleteResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(completeResponse.promise).mockReturnValueOnce(incompleteResponse.promise)
		);
		const complete = onboardingStore.toggleCheckbox('step-1', true);
		const incomplete = onboardingStore.toggleCheckbox('step-1', false);

		incompleteResponse.respond(Response.json({ message: 'Save failed' }, { status: 500 }));
		await expect(incomplete).resolves.toBe(false);
		const expectedComplete = { ...mockOnboarding, steps: [{ ...mockOnboarding.steps[0], completed: true }] };
		expect(onboardingStore.getById('ob-1')).toEqual(expectedComplete);

		completeResponse.respond(Response.json({ completed: true, currentStage: null }));
		await expect(complete).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expectedComplete);

		vi.mocked(fetch).mockResolvedValueOnce(Response.json({ completed: false, currentStage: null }));
		await expect(onboardingStore.toggleCheckbox('step-1', false)).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(mockOnboarding);
	});

	it('keeps refreshed saved work after a confirmed checkbox reversal while its older completion is pending', async () => {
		onboardingStore.load([mockOnboarding], 'org-1');
		const completeResponse = deferredResponse();
		const incompleteResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(completeResponse.promise).mockReturnValueOnce(incompleteResponse.promise)
		);
		const complete = onboardingStore.toggleCheckbox('step-1', true);
		const incomplete = onboardingStore.toggleCheckbox('step-1', false);
		incompleteResponse.respond(Response.json({ completed: false, currentStage: null }));
		await expect(incomplete).resolves.toBe(true);

		const refreshed = {
			...mockOnboarding,
			startedAt: '2026-03-02',
			steps: [
				{
					...mockOnboarding.steps[0],
					notes: [{ text: 'Fresh saved note', timestamp: '2026-10-02T12:00:00.000Z', userId: 'other-author' }]
				},
				{ ...mockOnboarding.steps[0], id: 'checkbox-2', completed: true }
			]
		};
		onboardingStore.load([refreshed], 'org-1');
		expect.soft(onboardingStore.getById('ob-1')).toEqual(refreshed);

		completeResponse.respond(Response.json({ completed: true, currentStage: null }));
		await expect(complete).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(refreshed);
	});

	it('retains confirmed Filed after an earlier Reviewed response arrives last', async () => {
		const original = paperworkOnboarding;
		onboardingStore.load([original], 'org-1');
		let reviewedResponse!: (response: Response) => void;
		let filedResponse!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockImplementationOnce(() => new Promise<Response>((resolve) => (reviewedResponse = resolve)))
				.mockImplementationOnce(() => new Promise<Response>((resolve) => (filedResponse = resolve)))
		);

		const reviewed = onboardingStore.advanceStage('step-1', 'Reviewed');
		const filed = onboardingStore.advanceStage('step-1', 'Filed');
		const expected = { ...original, steps: [{ ...original.steps[0], currentStage: 'Filed', completed: true }] };
		expect(onboardingStore.getById('ob-1')).toEqual(expected);

		filedResponse(Response.json({ currentStage: 'Filed', completed: true }));
		await expect(filed).resolves.toBe(true);
		expect.soft(onboardingStore.getById('ob-1')).toEqual(expected);

		reviewedResponse(Response.json({ currentStage: 'Reviewed', completed: false }));
		await expect(reviewed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
	});

	it('keeps an earlier pending stage when the newer request fails and permits retry', async () => {
		onboardingStore.load([paperworkOnboarding], 'org-1');
		const reviewedResponse = deferredResponse();
		const filedResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(reviewedResponse.promise).mockReturnValueOnce(filedResponse.promise)
		);
		const reviewed = onboardingStore.advanceStage('step-1', 'Reviewed');
		const filed = onboardingStore.advanceStage('step-1', 'Filed');

		filedResponse.respond(Response.json({ message: 'Save failed' }, { status: 500 }));
		await expect(filed).resolves.toBe(false);
		const expectedReviewed = {
			...paperworkOnboarding,
			steps: [{ ...paperworkOnboarding.steps[0], currentStage: 'Reviewed' }]
		};
		expect(onboardingStore.getById('ob-1')).toEqual(expectedReviewed);

		reviewedResponse.respond(Response.json({ currentStage: 'Reviewed', completed: false }));
		await expect(reviewed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expectedReviewed);

		vi.mocked(fetch).mockResolvedValueOnce(Response.json({ currentStage: 'Filed', completed: true }));
		await expect(onboardingStore.advanceStage('step-1', 'Filed')).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual({
			...paperworkOnboarding,
			steps: [{ ...paperworkOnboarding.steps[0], currentStage: 'Filed', completed: true }]
		});
	});

	it('rolls back a later failed stage to the earlier confirmed selection', async () => {
		onboardingStore.load([paperworkOnboarding], 'org-1');
		const reviewedResponse = deferredResponse();
		const filedResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(reviewedResponse.promise).mockReturnValueOnce(filedResponse.promise)
		);
		const reviewed = onboardingStore.advanceStage('step-1', 'Reviewed');
		const filed = onboardingStore.advanceStage('step-1', 'Filed');

		reviewedResponse.respond(Response.json({ currentStage: 'Reviewed', completed: false }));
		await expect(reviewed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual({
			...paperworkOnboarding,
			steps: [{ ...paperworkOnboarding.steps[0], currentStage: 'Filed', completed: true }]
		});

		filedResponse.respond(Response.json({ message: 'Save failed' }, { status: 500 }));
		await expect(filed).resolves.toBe(false);
		expect(onboardingStore.getById('ob-1')).toEqual({
			...paperworkOnboarding,
			steps: [{ ...paperworkOnboarding.steps[0], currentStage: 'Reviewed' }]
		});
	});

	it('preserves a different pending checkbox while retiring an older stage selection', async () => {
		const checkbox = { ...mockOnboarding.steps[0], id: 'checkbox-2', stepName: 'Orientation' };
		onboardingStore.load([{ ...paperworkOnboarding, steps: [...paperworkOnboarding.steps, checkbox] }], 'org-1');
		const reviewedResponse = deferredResponse();
		const checkboxResponse = deferredResponse();
		const filedResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockReturnValueOnce(reviewedResponse.promise)
				.mockReturnValueOnce(checkboxResponse.promise)
				.mockReturnValueOnce(filedResponse.promise)
		);
		const reviewed = onboardingStore.advanceStage('step-1', 'Reviewed');
		const checked = onboardingStore.toggleCheckbox('checkbox-2', true);
		const filed = onboardingStore.advanceStage('step-1', 'Filed');
		const expected = {
			...paperworkOnboarding,
			steps: [
				{ ...paperworkOnboarding.steps[0], currentStage: 'Filed', completed: true },
				{ ...checkbox, completed: true }
			]
		};

		filedResponse.respond(Response.json({ currentStage: 'Filed', completed: true }));
		await expect(filed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
		reviewedResponse.respond(Response.json({ currentStage: 'Reviewed', completed: false }));
		await expect(reviewed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
		checkboxResponse.respond(Response.json({ currentStage: null, completed: true }));
		await expect(checked).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
	});

	it.each([200, 500])('keeps the confirmed stage when a pending deprecated-step removal returns %s', async (status) => {
		const deprecated = {
			...mockOnboarding.steps[0],
			id: 'obsolete-step',
			stepName: 'Retired work',
			active: false,
			completed: true,
			notes: [{ text: 'Keep saved history', timestamp: '2026-09-01T12:00:00.000Z', userId: 'author' }]
		};
		onboardingStore.load([{ ...paperworkOnboarding, steps: [...paperworkOnboarding.steps, deprecated] }], 'org-1');
		const reviewedResponse = deferredResponse();
		const removalResponse = deferredResponse();
		const filedResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockReturnValueOnce(reviewedResponse.promise)
				.mockReturnValueOnce(removalResponse.promise)
				.mockReturnValueOnce(filedResponse.promise)
		);
		const reviewed = onboardingStore.advanceStage('step-1', 'Reviewed');
		const removed = onboardingStore.removeDeprecatedStep('obsolete-step');
		const filed = onboardingStore.advanceStage('step-1', 'Filed');
		const savedPaperwork = { ...paperworkOnboarding.steps[0], currentStage: 'Filed', completed: true };

		filedResponse.respond(Response.json({ currentStage: 'Filed', completed: true }));
		await expect(filed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual({ ...paperworkOnboarding, steps: [savedPaperwork] });
		reviewedResponse.respond(Response.json({ currentStage: 'Reviewed', completed: false }));
		await expect(reviewed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual({ ...paperworkOnboarding, steps: [savedPaperwork] });

		removalResponse.respond(Response.json({ success: status === 200 }, { status }));
		await expect(removed).resolves.toBe(status === 200);
		expect(onboardingStore.getById('ob-1')).toEqual({
			...paperworkOnboarding,
			steps: status === 200 ? [savedPaperwork] : [savedPaperwork, deprecated]
		});
	});

	it('rebases pending stages over fresh same-organization saved work', async () => {
		onboardingStore.load([paperworkOnboarding], 'org-1');
		const reviewedResponse = deferredResponse();
		const filedResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(reviewedResponse.promise).mockReturnValueOnce(filedResponse.promise)
		);
		const reviewed = onboardingStore.advanceStage('step-1', 'Reviewed');
		const filed = onboardingStore.advanceStage('step-1', 'Filed');
		const refreshed = {
			...paperworkOnboarding,
			startedAt: '2026-03-02',
			steps: [
				{
					...paperworkOnboarding.steps[0],
					notes: [{ text: 'Fresh saved note', timestamp: '2026-10-02T12:00:00.000Z', userId: 'other-author' }]
				},
				{ ...mockOnboarding.steps[0], id: 'checkbox-2', completed: true }
			]
		};
		onboardingStore.load([refreshed], 'org-1');
		const expected = {
			...refreshed,
			steps: [{ ...refreshed.steps[0], currentStage: 'Filed', completed: true }, refreshed.steps[1]]
		};
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
		filedResponse.respond(Response.json({ currentStage: 'Filed', completed: true }));
		await expect(filed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
		reviewedResponse.respond(Response.json({ currentStage: 'Reviewed', completed: false }));
		await expect(reviewed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
	});

	it('ignores a response after disposal without disturbing a new same-organization request', async () => {
		onboardingStore.load([paperworkOnboarding], 'org-1');
		const oldResponse = deferredResponse();
		const newResponse = deferredResponse();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise));
		const oldReviewed = onboardingStore.advanceStage('step-1', 'Reviewed');
		onboardingStore.invalidatePendingRequests();
		const refreshed = { ...paperworkOnboarding, startedAt: '2026-03-02' };
		onboardingStore.load([refreshed], 'org-1');
		const newFiled = onboardingStore.advanceStage('step-1', 'Filed');
		const expected = { ...refreshed, steps: [{ ...refreshed.steps[0], currentStage: 'Filed', completed: true }] };

		oldResponse.respond(Response.json({ currentStage: 'Reviewed', completed: false }));
		await expect(oldReviewed).resolves.toBe(false);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
		newResponse.respond(Response.json({ currentStage: 'Filed', completed: true }));
		await expect(newFiled).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);
	});

	it.each(['cancel', 'complete'] as const)(
		'rolls back optimistic %s after a 409 while retaining saved work and notes',
		async (operation) => {
			const original = {
				...mockOnboarding,
				steps: [
					{
						...mockOnboarding.steps[0],
						completed: true,
						notes: [{ text: 'Saved work', timestamp: '2026-09-01T12:00:00.000Z', userId: 'author-1' }]
					},
					{
						...mockOnboarding.steps[0],
						id: 'inactive-training',
						stepType: 'training' as const,
						trainingTypeId: 'training-1',
						active: false,
						completed: true
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

			const pending =
				operation === 'cancel' ? onboardingStore.cancelOnboarding('ob-1') : onboardingStore.completeOnboarding('ob-1');
			expect(onboardingStore.getById('ob-1')?.status).toBe(operation === 'cancel' ? 'cancelled' : 'completed');
			respond(Response.json({ message: 'Onboarding changed before persistence' }, { status: 409 }));

			await expect(pending).resolves.toBe(false);
			expect(onboardingStore.items).toEqual([original]);
		}
	);

	it.each([
		{
			kind: 'checkbox',
			mutate: () => onboardingStore.toggleCheckbox('step-1', true),
			result: { completed: true, currentStage: null },
			expectedSteps: [reconciledSteps[0], { ...reconciledSteps[1], completed: true }, reconciledSteps[2]]
		},
		{
			kind: 'stage',
			mutate: () => onboardingStore.advanceStage('paperwork-2', 'Filed'),
			result: { completed: true, currentStage: 'Filed' },
			expectedSteps: [
				{ ...reconciledSteps[0], completed: true, currentStage: 'Filed' },
				reconciledSteps[1],
				reconciledSteps[2]
			]
		}
	])(
		'retains a later confirmed $kind while adopting older reconciliation definitions',
		async ({ mutate, result, expectedSteps }) => {
			onboardingStore.load([checklistOnboarding], 'org-1');
			const resyncResponse = deferredResponse();
			const progressResponse = deferredResponse();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValueOnce(resyncResponse.promise).mockReturnValueOnce(progressResponse.promise)
			);
			const resynced = onboardingStore.resync('ob-1');
			const progressed = mutate();
			progressResponse.respond(Response.json(result));
			await expect(progressed).resolves.toBe(true);

			resyncResponse.respond(Response.json({ templateId: 'template-a', steps: reconciledSteps }));
			await expect(resynced).resolves.toEqual({ success: true });
			expect(onboardingStore.getById('ob-1')).toEqual({ ...checklistOnboarding, steps: expectedSteps });
		}
	);

	it('retains confirmed progress across a same-organization load while an older reconciliation response is held', async () => {
		onboardingStore.load([checklistOnboarding], 'org-1');
		const resyncResponse = deferredResponse();
		const progressResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(resyncResponse.promise).mockReturnValueOnce(progressResponse.promise)
		);
		const resynced = onboardingStore.resync('ob-1');
		const progressed = onboardingStore.toggleCheckbox('step-1', true);
		progressResponse.respond(Response.json({ completed: true, currentStage: null }));
		await expect(progressed).resolves.toBe(true);
		const refreshed = {
			...checklistOnboarding,
			startedAt: '2026-03-02',
			steps: [reconciledSteps[0], { ...reconciledSteps[1], completed: true }, reconciledSteps[2]]
		};
		onboardingStore.load([refreshed], 'org-1');
		resyncResponse.respond(Response.json({ templateId: 'template-a', steps: reconciledSteps }));
		await expect(resynced).resolves.toEqual({ success: true });
		expect(onboardingStore.getById('ob-1')).toEqual(refreshed);
	});

	it('adopts the older reconciliation after a later checkbox failure and permits retry', async () => {
		onboardingStore.load([checklistOnboarding], 'org-1');
		const resyncResponse = deferredResponse();
		const progressResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(resyncResponse.promise).mockReturnValueOnce(progressResponse.promise)
		);
		const resynced = onboardingStore.resync('ob-1');
		const progressed = onboardingStore.toggleCheckbox('step-1', true);
		progressResponse.respond(Response.json({ message: 'Save failed' }, { status: 503 }));
		await expect(progressed).resolves.toBe(false);
		resyncResponse.respond(Response.json({ templateId: 'template-a', steps: reconciledSteps }));
		await expect(resynced).resolves.toEqual({ success: true });
		expect(onboardingStore.getById('ob-1')).toEqual({ ...checklistOnboarding, steps: reconciledSteps });

		vi.mocked(fetch).mockResolvedValueOnce(Response.json({ completed: true, currentStage: null }));
		await expect(onboardingStore.toggleCheckbox('step-1', true)).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual({
			...checklistOnboarding,
			steps: [reconciledSteps[0], { ...reconciledSteps[1], completed: true }, reconciledSteps[2]]
		});
	});

	it.each([200, 503])(
		'rebases newer pending checkbox progress over adopted definitions before its response returns %s',
		async (status) => {
			onboardingStore.load([checklistOnboarding], 'org-1');
			const resyncResponse = deferredResponse();
			const progressResponse = deferredResponse();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValueOnce(resyncResponse.promise).mockReturnValueOnce(progressResponse.promise)
			);
			const resynced = onboardingStore.resync('ob-1');
			const progressed = onboardingStore.toggleCheckbox('step-1', true);
			const savedSteps = [reconciledSteps[0], { ...reconciledSteps[1], completed: status === 200 }, reconciledSteps[2]];
			resyncResponse.respond(Response.json({ templateId: 'template-a', steps: reconciledSteps }));
			await expect(resynced).resolves.toEqual({ success: true });
			expect.soft(onboardingStore.getById('ob-1')).toEqual({
				...checklistOnboarding,
				steps: [reconciledSteps[0], { ...reconciledSteps[1], completed: true }, reconciledSteps[2]]
			});

			progressResponse.respond(Response.json({ completed: true, currentStage: null }, { status }));
			await expect(progressed).resolves.toBe(status === 200);
			expect(onboardingStore.getById('ob-1')).toEqual({ ...checklistOnboarding, steps: savedSteps });
		}
	);

	it('retains a newer reconciliation stage reset when the earlier Filed response arrives last', async () => {
		onboardingStore.load([checklistOnboarding], 'org-1');
		const progressResponse = deferredResponse();
		const resyncResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(progressResponse.promise).mockReturnValueOnce(resyncResponse.promise)
		);
		const progressed = onboardingStore.advanceStage('paperwork-2', 'Filed');
		const resynced = onboardingStore.resync('ob-1');
		resyncResponse.respond(Response.json({ templateId: 'template-a', steps: resetStageSteps }));
		await expect(resynced).resolves.toEqual({ success: true });
		expect.soft(onboardingStore.getById('ob-1')).toEqual({ ...checklistOnboarding, steps: resetStageSteps });

		progressResponse.respond(Response.json({ completed: true, currentStage: 'Filed' }));
		await expect(progressed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual({ ...checklistOnboarding, steps: resetStageSteps });
	});

	it('keeps earlier pending progress eligible after a newer reconciliation fails and permits retry', async () => {
		onboardingStore.load([checklistOnboarding], 'org-1');
		const progressResponse = deferredResponse();
		const resyncResponse = deferredResponse();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockReturnValueOnce(progressResponse.promise).mockReturnValueOnce(resyncResponse.promise)
		);
		const progressed = onboardingStore.advanceStage('paperwork-2', 'Filed');
		const resynced = onboardingStore.resync('ob-1');
		resyncResponse.respond(Response.json({ message: 'Cannot reconcile' }, { status: 503 }));
		await expect(resynced).resolves.toEqual({ success: false, error: 'Cannot reconcile' });
		const expected = {
			...checklistOnboarding,
			steps: [checklistOnboarding.steps[0], { ...checklistOnboarding.steps[1], completed: true, currentStage: 'Filed' }]
		};
		expect.soft(onboardingStore.getById('ob-1')).toEqual(expected);
		progressResponse.respond(Response.json({ completed: true, currentStage: 'Filed' }));
		await expect(progressed).resolves.toBe(true);
		expect(onboardingStore.getById('ob-1')).toEqual(expected);

		vi.mocked(fetch).mockResolvedValueOnce(Response.json({ templateId: 'template-a', steps: resetStageSteps }));
		await expect(onboardingStore.resync('ob-1')).resolves.toEqual({ success: true });
		expect(onboardingStore.getById('ob-1')).toEqual({ ...checklistOnboarding, steps: resetStageSteps });
	});

	it.each(['switch', 'assign', 'resync'] as const)(
		'retains a newer %s result when the older reconciliation response arrives last',
		async (kind) => {
			const original =
				kind === 'assign'
					? {
							...checklistOnboarding,
							templateId: null,
							steps: checklistOnboarding.steps.map((step) => ({ ...step, templateStepId: null }))
						}
					: checklistOnboarding;
			onboardingStore.load([original], 'org-1');
			const oldResponse = deferredResponse();
			const newResponse = deferredResponse();
			vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise));
			const older =
				kind === 'assign' ? onboardingStore.assignTemplate('ob-1', 'template-b') : onboardingStore.resync('ob-1');
			const newer =
				kind === 'switch'
					? onboardingStore.switchTemplate('ob-1', 'template-a')
					: kind === 'assign'
						? onboardingStore.assignTemplate('ob-1', 'template-a')
						: onboardingStore.resync('ob-1');
			const olderTask = {
				...mockOnboarding.steps[0],
				id: 'older-only',
				templateStepId: 'older-definition',
				stepName: 'Older template task'
			};
			const savedSteps =
				kind === 'assign'
					? [
							{ ...reconciledSteps[0], id: 'assigned-paperwork', notes: [] },
							{ ...reconciledSteps[1], id: 'assigned-orientation' },
							reconciledSteps[2],
							...original.steps.map((step) => ({ ...step, active: false })),
							{ ...olderTask, active: false }
						]
					: [...reconciledSteps, { ...olderTask, active: false }];

			newResponse.respond(Response.json({ templateId: 'template-a', steps: savedSteps }));
			await expect(newer).resolves.toEqual({ success: true });
			const expected = { ...original, templateId: 'template-a', steps: savedSteps };
			expect(onboardingStore.getById('ob-1')).toEqual(expected);

			oldResponse.respond(
				Response.json({
					templateId: 'template-b',
					steps: [{ ...original.steps[0], active: false }, { ...original.steps[1], active: false }, olderTask]
				})
			);
			await expect(older).resolves.toEqual({ success: true });
			expect(onboardingStore.getById('ob-1')).toEqual(expected);
		}
	);

	it('keeps the older reconciliation eligible after a newer template switch fails', async () => {
		onboardingStore.load([checklistOnboarding], 'org-1');
		const oldResponse = deferredResponse();
		const newResponse = deferredResponse();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise));
		const older = onboardingStore.resync('ob-1');
		const newer = onboardingStore.switchTemplate('ob-1', 'template-b');
		newResponse.respond(Response.json({ message: 'Template unavailable' }, { status: 503 }));
		await expect(newer).resolves.toEqual({ success: false, error: 'Template unavailable' });
		oldResponse.respond(Response.json({ templateId: 'template-a', steps: reconciledSteps }));
		await expect(older).resolves.toEqual({ success: true });
		expect(onboardingStore.getById('ob-1')).toEqual({ ...checklistOnboarding, steps: reconciledSteps });

		const switchedSteps = [
			{ ...reconciledSteps[0], active: false },
			{ ...reconciledSteps[1], active: false },
			{ ...reconciledSteps[2], active: false },
			{
				...mockOnboarding.steps[0],
				id: 'alternate-step',
				templateStepId: 'alternate-definition',
				stepName: 'Alternate task'
			}
		];
		vi.mocked(fetch).mockResolvedValueOnce(Response.json({ templateId: 'template-b', steps: switchedSteps }));
		await expect(onboardingStore.switchTemplate('ob-1', 'template-b')).resolves.toEqual({ success: true });
		expect(onboardingStore.getById('ob-1')).toEqual({
			...checklistOnboarding,
			templateId: 'template-b',
			steps: switchedSteps
		});
	});

	it.each([200, 503])(
		'retains reconciliation additions and the saved disposition of an inactive removal returning %s',
		async (status) => {
			const inactive = {
				...mockOnboarding.steps[0],
				id: 'obsolete-step',
				stepName: 'Retired work',
				active: false,
				notes: [{ text: 'Keep saved history', timestamp: '2026-09-01T12:00:00.000Z', userId: 'author' }]
			};
			onboardingStore.load([{ ...checklistOnboarding, steps: [...checklistOnboarding.steps, inactive] }], 'org-1');
			const resyncResponse = deferredResponse();
			const removalResponse = deferredResponse();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValueOnce(resyncResponse.promise).mockReturnValueOnce(removalResponse.promise)
			);
			const resynced = onboardingStore.resync('ob-1');
			const removed = onboardingStore.removeDeprecatedStep('obsolete-step');
			removalResponse.respond(Response.json({ success: status === 200 }, { status }));
			await expect(removed).resolves.toBe(status === 200);
			resyncResponse.respond(Response.json({ templateId: 'template-a', steps: [...reconciledSteps, inactive] }));
			await expect(resynced).resolves.toEqual({ success: true });
			expect(onboardingStore.getById('ob-1')).toEqual({
				...checklistOnboarding,
				steps: status === 200 ? reconciledSteps : [...reconciledSteps, inactive]
			});
		}
	);

	it.each(['organization', 'disposal'] as const)(
		'ignores an invalidated reconciliation after %s without disturbing a new same-organization request',
		async (lifetime) => {
			onboardingStore.load([checklistOnboarding], 'org-1');
			const oldResponse = deferredResponse();
			const newResponse = deferredResponse();
			vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise));
			const older = onboardingStore.resync('ob-1');
			if (lifetime === 'organization') onboardingStore.enterOrganization('org-2');
			else onboardingStore.invalidatePendingRequests();
			const refreshed = { ...checklistOnboarding, startedAt: '2026-03-02' };
			onboardingStore.load([refreshed], 'org-1');
			const newer = onboardingStore.switchTemplate('ob-1', 'template-a');

			oldResponse.respond(Response.json({ templateId: 'old-template', steps: [] }));
			await expect(older).resolves.toEqual({ success: false });
			expect(onboardingStore.getById('ob-1')).toEqual(refreshed);
			newResponse.respond(Response.json({ templateId: 'template-a', steps: reconciledSteps }));
			await expect(newer).resolves.toEqual({ success: true });
			expect(onboardingStore.getById('ob-1')).toEqual({
				...refreshed,
				templateId: 'template-a',
				steps: reconciledSteps
			});
		}
	);

	it('resyncs the template and steps when another user has switched the packet', async () => {
		onboardingStore.load([{ ...mockOnboarding, templateId: 'template-a' }], 'org-1');
		const steps = [{ ...mockOnboarding.steps[0], templateStepId: 'template-b-step', stepName: 'Equipment' }];
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ templateId: 'template-b', steps })));

		await expect(onboardingStore.resync('ob-1')).resolves.toEqual({ success: true });

		expect(onboardingStore.getById('ob-1')).toEqual({ ...mockOnboarding, templateId: 'template-b', steps });
	});

	it.each([
		[
			'start',
			() => onboardingStore.startOnboarding('p-new', '2026-03-15', 'template-1'),
			{ ...mockOnboarding, id: 'ob-new', personnelId: 'p-new' }
		],
		['checkbox', () => onboardingStore.toggleCheckbox('step-1', true), { completed: true, currentStage: null }],
		['stage', () => onboardingStore.advanceStage('step-1', 'Filed'), { completed: true, currentStage: 'Filed' }],
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
