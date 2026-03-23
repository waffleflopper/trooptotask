import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { toggleCheckbox, advanceStage, refreshTrainingSteps } from './onboardingStepProgress';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: { readOnly?: boolean }): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext();
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	return { store, auth, audit: auditPort, readOnlyGuard, auditPort };
}

function seedStep(ctx: TestContext, overrides?: Record<string, unknown>) {
	ctx.store.seed('onboarding_step_progress', [
		{
			id: 'step-1',
			onboarding_id: 'ob-1',
			step_name: 'Get ID card',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			template_step_id: 'ts-1',
			active: true,
			organization_id: 'test-org',
			...overrides
		}
	]);
}

describe('toggleCheckbox', () => {
	it('sets completed on a checkbox step', async () => {
		const ctx = buildContext();
		seedStep(ctx);

		const result = await toggleCheckbox(ctx, { stepId: 'step-1', completed: true });

		expect(result.completed).toBe(true);
		expect(result.id).toBe('step-1');
	});

	it('unchecks a previously completed checkbox step', async () => {
		const ctx = buildContext();
		seedStep(ctx, { completed: true });

		const result = await toggleCheckbox(ctx, { stepId: 'step-1', completed: false });

		expect(result.completed).toBe(false);
	});

	it('rejects toggle on non-checkbox step types', async () => {
		const ctx = buildContext();
		seedStep(ctx, { step_type: 'paperwork' });

		await expect(toggleCheckbox(ctx, { stepId: 'step-1', completed: true })).rejects.toThrow(
			'Only checkbox steps can be toggled'
		);
	});

	it('rejects toggle on training step types', async () => {
		const ctx = buildContext();
		seedStep(ctx, { step_type: 'training', training_type_id: 'tt-cpr' });

		await expect(toggleCheckbox(ctx, { stepId: 'step-1', completed: true })).rejects.toThrow(
			'Only checkbox steps can be toggled'
		);
	});

	it('blocks toggle when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedStep(ctx);

		await expect(toggleCheckbox(ctx, { stepId: 'step-1', completed: true })).rejects.toThrow(
			'Organization is in read-only mode'
		);
	});
});

function seedPaperworkStep(ctx: TestContext, overrides?: Record<string, unknown>) {
	ctx.store.seed('onboarding_step_progress', [
		{
			id: 'pw-step-1',
			onboarding_id: 'ob-1',
			step_name: 'CAC Request',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['with soldier', 'submitted', 'approved'],
			sort_order: 0,
			completed: false,
			current_stage: 'with soldier',
			notes: [],
			template_step_id: 'ts-2',
			active: true,
			organization_id: 'test-org',
			...overrides
		}
	]);
}

describe('advanceStage', () => {
	it('sets currentStage on a paperwork step', async () => {
		const ctx = buildContext();
		seedPaperworkStep(ctx);

		const result = await advanceStage(ctx, { stepId: 'pw-step-1', stageName: 'submitted' });

		expect(result.currentStage).toBe('submitted');
		expect(result.id).toBe('pw-step-1');
		expect(result.completed).toBe(false);
	});

	it('auto-completes when advancing to the last stage', async () => {
		const ctx = buildContext();
		seedPaperworkStep(ctx);

		const result = await advanceStage(ctx, { stepId: 'pw-step-1', stageName: 'approved' });

		expect(result.currentStage).toBe('approved');
		expect(result.completed).toBe(true);
	});

	it('sets completed to false when regressing from last stage', async () => {
		const ctx = buildContext();
		seedPaperworkStep(ctx, { current_stage: 'approved', completed: true });

		const result = await advanceStage(ctx, { stepId: 'pw-step-1', stageName: 'submitted' });

		expect(result.currentStage).toBe('submitted');
		expect(result.completed).toBe(false);
	});

	it('rejects advancing a non-paperwork step type', async () => {
		const ctx = buildContext();
		seedStep(ctx); // checkbox step

		await expect(advanceStage(ctx, { stepId: 'step-1', stageName: 'submitted' })).rejects.toThrow(
			'Only paperwork steps can be advanced'
		);
	});

	it('rejects an invalid stage name', async () => {
		const ctx = buildContext();
		seedPaperworkStep(ctx);

		await expect(advanceStage(ctx, { stepId: 'pw-step-1', stageName: 'nonexistent' })).rejects.toThrow(
			'Invalid stage name'
		);
	});

	it('rejects advancing a training step type', async () => {
		const ctx = buildContext();
		seedTrainingStep(ctx);

		await expect(advanceStage(ctx, { stepId: 'tr-step-1', stageName: 'submitted' })).rejects.toThrow(
			'Only paperwork steps can be advanced'
		);
	});

	it('blocks advance when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedPaperworkStep(ctx);

		await expect(advanceStage(ctx, { stepId: 'pw-step-1', stageName: 'submitted' })).rejects.toThrow(
			'Organization is in read-only mode'
		);
	});

	it('emits audit log on stage advance', async () => {
		const ctx = buildContext();
		seedPaperworkStep(ctx);

		await advanceStage(ctx, { stepId: 'pw-step-1', stageName: 'submitted' });

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'onboarding_step.stage_advanced',
			resourceType: 'onboarding_step_progress',
			resourceId: 'pw-step-1'
		});
	});
});

function seedTrainingStep(ctx: TestContext, overrides?: Record<string, unknown>) {
	ctx.store.seed('onboarding_step_progress', [
		{
			id: 'tr-step-1',
			onboarding_id: 'ob-1',
			step_name: 'CPR Training',
			step_type: 'training',
			training_type_id: 'tt-cpr',
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			template_step_id: 'ts-3',
			active: true,
			organization_id: 'test-org',
			...overrides
		}
	]);
}

function seedOnboarding(ctx: TestContext, overrides?: Record<string, unknown>) {
	ctx.store.seed('personnel_onboardings', [
		{
			id: 'ob-1',
			personnel_id: 'p-1',
			template_id: 'tmpl-1',
			status: 'in_progress',
			started_at: '2026-01-01T00:00:00Z',
			completed_at: null,
			cancelled_at: null,
			organization_id: 'test-org',
			...overrides
		}
	]);
}

describe('refreshTrainingSteps', () => {
	it('sets completed=true for training steps with matching training records', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTrainingStep(ctx);
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt-1',
				personnel_id: 'p-1',
				training_type_id: 'tt-cpr',
				organization_id: 'test-org'
			}
		]);

		const result = await refreshTrainingSteps(ctx, { onboardingId: 'ob-1' });

		expect(result).toHaveLength(1);
		expect(result[0].completed).toBe(true);
		expect(result[0].id).toBe('tr-step-1');
	});

	it('sets completed=false for training steps without matching training records', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTrainingStep(ctx, { completed: true }); // was true, should become false

		const result = await refreshTrainingSteps(ctx, { onboardingId: 'ob-1' });

		expect(result).toHaveLength(1);
		expect(result[0].completed).toBe(false);
	});

	it('only queries training records for the specific soldier and training type IDs', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTrainingStep(ctx);

		// Training record for a DIFFERENT soldier
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt-other',
				personnel_id: 'p-other',
				training_type_id: 'tt-cpr',
				organization_id: 'test-org'
			}
		]);

		const result = await refreshTrainingSteps(ctx, { onboardingId: 'ob-1' });

		expect(result[0].completed).toBe(false);
	});

	it('returns empty array when no training steps exist', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedStep(ctx); // only a checkbox step

		const result = await refreshTrainingSteps(ctx, { onboardingId: 'ob-1' });

		expect(result).toHaveLength(0);
	});

	it('handles multiple training steps with mixed completion', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTrainingStep(ctx);
		ctx.store.seed('onboarding_step_progress', [
			{
				id: 'tr-step-2',
				onboarding_id: 'ob-1',
				step_name: 'First Aid',
				step_type: 'training',
				training_type_id: 'tt-firstaid',
				stages: null,
				sort_order: 1,
				completed: false,
				current_stage: null,
				notes: [],
				template_step_id: 'ts-4',
				active: true,
				organization_id: 'test-org'
			}
		]);

		// Only CPR has a training record, not First Aid
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt-1',
				personnel_id: 'p-1',
				training_type_id: 'tt-cpr',
				organization_id: 'test-org'
			}
		]);

		const result = await refreshTrainingSteps(ctx, { onboardingId: 'ob-1' });

		expect(result).toHaveLength(2);
		const cpr = result.find((s) => s.id === 'tr-step-1');
		const firstAid = result.find((s) => s.id === 'tr-step-2');
		expect(cpr?.completed).toBe(true);
		expect(firstAid?.completed).toBe(false);
	});
});
