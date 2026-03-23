import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { startOnboarding } from './onboardingLifecycle';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: { readOnly?: boolean; role?: 'owner' | 'admin' | 'member' }): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext({ role: overrides?.role ?? 'owner' });
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	return { store, auth, audit: auditPort, readOnlyGuard, auditPort };
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
