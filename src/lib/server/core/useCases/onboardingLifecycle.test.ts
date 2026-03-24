import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { startOnboarding, cancelOnboarding, reopenOnboarding, completeOnboarding } from './onboardingLifecycle';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: { readOnly?: boolean; role?: 'owner' | 'admin' | 'member' }): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext({ role: overrides?.role ?? 'owner' });
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	return { store, rawStore: store, auth, audit: auditPort, readOnlyGuard, auditPort };
}

function seedTemplateWithSteps(ctx: TestContext) {
	ctx.store.seed('onboarding_templates', [
		{ id: 'tmpl-1', name: 'New Soldier Checklist', organization_id: 'test-org' }
	]);
	ctx.store.seed('onboarding_template_steps', [
		{
			id: 'ts-1',
			template_id: 'tmpl-1',
			name: 'Get ID card',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			organization_id: 'test-org'
		},
		{
			id: 'ts-2',
			template_id: 'tmpl-1',
			name: 'CAC Request',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['with soldier', 'submitted', 'approved'],
			sort_order: 1,
			organization_id: 'test-org'
		},
		{
			id: 'ts-3',
			template_id: 'tmpl-1',
			name: 'CPR Training',
			step_type: 'training',
			training_type_id: 'tt-cpr',
			stages: null,
			sort_order: 2,
			organization_id: 'test-org'
		}
	]);
}

describe('startOnboarding', () => {
	it('snapshots template steps into step progress rows', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		expect(result.personnelId).toBe('p-1');
		expect(result.templateId).toBe('tmpl-1');
		expect(result.status).toBe('in_progress');
		expect(result.steps).toHaveLength(3);
		expect(result.steps[0].stepName).toBe('Get ID card');
		expect(result.steps[0].templateStepId).toBe('ts-1');
		expect(result.steps[1].stepName).toBe('CAC Request');
		expect(result.steps[1].templateStepId).toBe('ts-2');
		expect(result.steps[2].stepName).toBe('CPR Training');
		expect(result.steps[2].templateStepId).toBe('ts-3');
	});

	it('initializes paperwork steps with first stage as currentStage', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		const paperworkStep = result.steps.find((s) => s.stepType === 'paperwork');
		expect(paperworkStep?.currentStage).toBe('with soldier');
		expect(paperworkStep?.completed).toBe(false);
	});

	it('initializes checkbox steps as uncompleted with no currentStage', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		const checkboxStep = result.steps.find((s) => s.stepType === 'checkbox');
		expect(checkboxStep?.completed).toBe(false);
		expect(checkboxStep?.currentStage).toBeNull();
	});

	it('rejects start if soldier already has an active onboarding', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		// Start first onboarding
		await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		// Attempt second should fail
		await expect(startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' })).rejects.toThrow(
			'Soldier already has an active onboarding'
		);
	});

	it('blocks start when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedTemplateWithSteps(ctx);

		await expect(startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' })).rejects.toThrow(
			'Organization is in read-only mode'
		);
	});

	it('emits audit log on start', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'onboarding.started',
			resourceType: 'personnel_onboarding',
			resourceId: result.id
		});
	});

	it('sets training step completed=true when a matching training record exists', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		// Seed a training record for CPR training for this soldier
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt-1',
				personnel_id: 'p-1',
				training_type_id: 'tt-cpr',
				organization_id: 'test-org'
			}
		]);

		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		const trainingStep = result.steps.find((s) => s.stepType === 'training');
		expect(trainingStep?.completed).toBe(true);
	});

	it('sets training step completed=false when no matching training record exists', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		// No training records seeded

		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		const trainingStep = result.steps.find((s) => s.stepType === 'training');
		expect(trainingStep?.completed).toBe(false);
	});

	it('allows starting a new onboarding after previous one is cancelled', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		const first = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });
		await cancelOnboarding(ctx, first.id);
		const second = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		expect(second.status).toBe('in_progress');
		expect(second.id).not.toBe(first.id);
	});

	it('only queries training records for the specific soldier and training type IDs', async () => {
		const ctx = buildContext();
		seedTemplateWithSteps(ctx);

		// Seed training record for a DIFFERENT soldier — should not affect p-1
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt-other',
				personnel_id: 'p-other',
				training_type_id: 'tt-cpr',
				organization_id: 'test-org'
			}
		]);

		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });

		const trainingStep = result.steps.find((s) => s.stepType === 'training');
		expect(trainingStep?.completed).toBe(false);
	});
});

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

describe('cancelOnboarding', () => {
	it('sets status to cancelled with cancelled_at timestamp', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);

		const result = await cancelOnboarding(ctx, 'ob-1');

		expect(result.status).toBe('cancelled');
		expect(result.cancelledAt).toBeTruthy();
		expect(new Date(result.cancelledAt!).toISOString()).toBe(result.cancelledAt);
	});

	it('rejects when onboarding not found', async () => {
		const ctx = buildContext();

		await expect(cancelOnboarding(ctx, 'nonexistent')).rejects.toThrow('Onboarding not found');
	});

	it('blocks when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedOnboarding(ctx);

		await expect(cancelOnboarding(ctx, 'ob-1')).rejects.toThrow('Organization is in read-only mode');
	});

	it('rejects cancelling a completed onboarding', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'completed', completed_at: '2026-03-01T00:00:00Z' });

		await expect(cancelOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be cancelled');
	});

	it('rejects cancelling an already cancelled onboarding', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		await expect(cancelOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be cancelled');
	});

	it('emits audit log', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);

		await cancelOnboarding(ctx, 'ob-1');

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'onboarding.cancelled',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1'
		});
	});
});

describe('reopenOnboarding', () => {
	it('sets status back to in_progress and clears cancelled_at', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		const result = await reopenOnboarding(ctx, 'ob-1');

		expect(result.status).toBe('in_progress');
		expect(result.cancelledAt).toBeNull();
	});

	it('rejects reopening an in_progress onboarding', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx); // status: in_progress

		await expect(reopenOnboarding(ctx, 'ob-1')).rejects.toThrow('Only cancelled onboardings can be reopened');
	});

	it('rejects reopening a completed onboarding', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'completed', completed_at: '2026-03-01T00:00:00Z' });

		await expect(reopenOnboarding(ctx, 'ob-1')).rejects.toThrow('Only cancelled onboardings can be reopened');
	});

	it('emits audit log', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		await reopenOnboarding(ctx, 'ob-1');

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'onboarding.reopened',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1'
		});
	});
});

function seedSteps(ctx: TestContext, overrides?: Record<string, unknown>[]) {
	const defaults = [
		{
			id: 'step-1',
			onboarding_id: 'ob-1',
			step_name: 'Get ID card',
			step_type: 'checkbox',
			completed: false,
			active: true,
			organization_id: 'test-org'
		},
		{
			id: 'step-2',
			onboarding_id: 'ob-1',
			step_name: 'CAC Request',
			step_type: 'paperwork',
			completed: true,
			active: true,
			organization_id: 'test-org'
		},
		{
			id: 'step-3',
			onboarding_id: 'ob-1',
			step_name: 'CPR Training',
			step_type: 'training',
			completed: false,
			active: true,
			organization_id: 'test-org'
		}
	];
	const rows = overrides ?? defaults;
	ctx.store.seed('onboarding_step_progress', rows);
}

describe('completeOnboarding', () => {
	it('sets status to completed with completed_at and returns incomplete count', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedSteps(ctx); // 2 incomplete (step-1, step-3), 1 complete (step-2)

		const result = await completeOnboarding(ctx, 'ob-1');

		expect(result.status).toBe('completed');
		expect(result.completedAt).toBeTruthy();
		expect(new Date(result.completedAt!).toISOString()).toBe(result.completedAt);
		expect(result.incompleteCount).toBe(2);
	});

	it('returns 0 incomplete count when all active steps are complete', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedSteps(ctx, [
			{
				id: 'step-1',
				onboarding_id: 'ob-1',
				step_type: 'checkbox',
				completed: true,
				active: true,
				organization_id: 'test-org'
			},
			{
				id: 'step-2',
				onboarding_id: 'ob-1',
				step_type: 'paperwork',
				completed: true,
				active: true,
				organization_id: 'test-org'
			}
		]);

		const result = await completeOnboarding(ctx, 'ob-1');

		expect(result.incompleteCount).toBe(0);
	});

	it('excludes inactive steps from incomplete count', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedSteps(ctx, [
			{
				id: 'step-1',
				onboarding_id: 'ob-1',
				step_type: 'checkbox',
				completed: true,
				active: true,
				organization_id: 'test-org'
			},
			{
				id: 'step-2',
				onboarding_id: 'ob-1',
				step_type: 'checkbox',
				completed: false,
				active: false,
				organization_id: 'test-org'
			}
		]);

		const result = await completeOnboarding(ctx, 'ob-1');

		expect(result.incompleteCount).toBe(0);
	});

	it('rejects completing a cancelled onboarding', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		await expect(completeOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be completed');
	});

	it('rejects completing an already completed onboarding', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'completed', completed_at: '2026-03-01T00:00:00Z' });

		await expect(completeOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be completed');
	});

	it('emits audit log with incomplete count', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedSteps(ctx);

		await completeOnboarding(ctx, 'ob-1');

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'onboarding.completed',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1',
			details: { incompleteCount: 2 }
		});
	});
});
