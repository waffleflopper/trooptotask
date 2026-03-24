import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { resyncOnboarding, switchTemplate } from './onboardingResync';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	subscription: ReturnType<typeof createTestSubscriptionPort>;
};

function buildContext(overrides?: { readOnly?: boolean; isFullEditor?: boolean }): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext({
		isFullEditor: overrides?.isFullEditor ?? true
	});
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	const subscription = createTestSubscriptionPort();
	return { store, rawStore: store, auth, audit: auditPort, readOnlyGuard, subscription, auditPort };
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

function seedTemplateSteps(ctx: TestContext, steps?: Record<string, unknown>[]) {
	const defaults = [
		{
			id: 'ts-1',
			template_id: 'tmpl-1',
			name: 'Get ID card',
			description: 'Visit badge office',
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
			description: 'Submit CAC form',
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
			description: 'Complete CPR cert',
			step_type: 'training',
			training_type_id: 'tt-cpr',
			stages: null,
			sort_order: 2,
			organization_id: 'test-org'
		}
	];
	ctx.store.seed('onboarding_template_steps', steps ?? defaults);
}

function seedInstanceSteps(ctx: TestContext, steps?: Record<string, unknown>[]) {
	const defaults = [
		{
			id: 'sp-1',
			onboarding_id: 'ob-1',
			template_step_id: 'ts-1',
			step_name: 'Get ID card',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			completed: true,
			current_stage: null,
			notes: [{ text: 'Called badge office', timestamp: '2026-03-01T00:00:00Z', userId: 'user-1' }],
			active: true,
			organization_id: 'test-org'
		},
		{
			id: 'sp-2',
			onboarding_id: 'ob-1',
			template_step_id: 'ts-2',
			step_name: 'CAC Request',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['with soldier', 'submitted', 'approved'],
			sort_order: 1,
			completed: false,
			current_stage: 'submitted',
			notes: [],
			active: true,
			organization_id: 'test-org'
		},
		{
			id: 'sp-3',
			onboarding_id: 'ob-1',
			template_step_id: 'ts-3',
			step_name: 'CPR Training',
			step_type: 'training',
			training_type_id: 'tt-cpr',
			stages: null,
			sort_order: 2,
			completed: false,
			current_stage: null,
			notes: [],
			active: true,
			organization_id: 'test-org'
		}
	];
	ctx.store.seed('onboarding_step_progress', steps ?? defaults);
}

describe('resyncOnboarding', () => {
	it('deactivates instance steps that are no longer in the template', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template now only has ts-1 and ts-2 (ts-3 removed)
		seedTemplateSteps(ctx, [
			{
				id: 'ts-1',
				template_id: 'tmpl-1',
				name: 'Get ID card',
				description: 'Visit badge office',
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
				description: 'Submit CAC form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'approved'],
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx); // has ts-1, ts-2, ts-3

		const result = await resyncOnboarding(ctx, 'ob-1');

		const deactivated = result.steps.find((s) => s.templateStepId === 'ts-3');
		expect(deactivated?.active).toBe(false);
		// Progress and notes preserved
		expect(deactivated?.completed).toBe(false);
		expect(deactivated?.notes).toEqual([]);
	});

	it('preserves progress and notes on deactivated steps', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template only has ts-2 and ts-3 (ts-1 removed)
		seedTemplateSteps(ctx, [
			{
				id: 'ts-2',
				template_id: 'tmpl-1',
				name: 'CAC Request',
				description: 'Submit CAC form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'approved'],
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: 'ts-3',
				template_id: 'tmpl-1',
				name: 'CPR Training',
				description: 'Complete CPR cert',
				step_type: 'training',
				training_type_id: 'tt-cpr',
				stages: null,
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx);

		const result = await resyncOnboarding(ctx, 'ob-1');

		const deactivated = result.steps.find((s) => s.templateStepId === 'ts-1');
		expect(deactivated?.active).toBe(false);
		expect(deactivated?.completed).toBe(true); // was completed before deactivation
		expect(deactivated?.notes).toHaveLength(1);
		expect(deactivated?.notes[0].text).toBe('Called badge office');
	});

	it('inserts new template steps as new step progress rows', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template has ts-1, ts-2, ts-3 plus a new ts-4
		seedTemplateSteps(ctx, [
			{
				id: 'ts-1',
				template_id: 'tmpl-1',
				name: 'Get ID card',
				description: 'Visit badge office',
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
				description: 'Submit CAC form',
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
				description: 'Complete CPR cert',
				step_type: 'training',
				training_type_id: 'tt-cpr',
				stages: null,
				sort_order: 2,
				organization_id: 'test-org'
			},
			{
				id: 'ts-4',
				template_id: 'tmpl-1',
				name: 'Security Briefing',
				description: 'Attend security brief',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 3,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx); // only ts-1, ts-2, ts-3

		const result = await resyncOnboarding(ctx, 'ob-1');

		const newStep = result.steps.find((s) => s.templateStepId === 'ts-4');
		expect(newStep).toBeDefined();
		expect(newStep?.stepName).toBe('Security Briefing');
		expect(newStep?.completed).toBe(false);
		expect(newStep?.active).toBe(true);
		expect(newStep?.sortOrder).toBe(3);
	});

	it('initializes new paperwork steps with first stage', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTemplateSteps(ctx, [
			{
				id: 'ts-1',
				template_id: 'tmpl-1',
				name: 'Get ID card',
				description: 'Visit badge office',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: 'ts-new-pw',
				template_id: 'tmpl-1',
				name: 'New Paperwork',
				description: 'New form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['draft', 'review', 'complete'],
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx, [
			{
				id: 'sp-1',
				onboarding_id: 'ob-1',
				template_step_id: 'ts-1',
				step_name: 'Get ID card',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0,
				completed: true,
				current_stage: null,
				notes: [],
				active: true,
				organization_id: 'test-org'
			}
		]);

		const result = await resyncOnboarding(ctx, 'ob-1');

		const pwStep = result.steps.find((s) => s.templateStepId === 'ts-new-pw');
		expect(pwStep?.currentStage).toBe('draft');
		expect(pwStep?.completed).toBe(false);
	});

	it('updates metadata on steps that exist in both template and instance', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template has ts-1 with updated name and description
		seedTemplateSteps(ctx, [
			{
				id: 'ts-1',
				template_id: 'tmpl-1',
				name: 'Get Military ID',
				description: 'Updated description',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 5,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx, [
			{
				id: 'sp-1',
				onboarding_id: 'ob-1',
				template_step_id: 'ts-1',
				step_name: 'Get ID card',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0,
				completed: true,
				current_stage: null,
				notes: [{ text: 'Called office', timestamp: '2026-03-01T00:00:00Z', userId: 'u-1' }],
				active: true,
				organization_id: 'test-org'
			}
		]);

		const result = await resyncOnboarding(ctx, 'ob-1');

		const updated = result.steps.find((s) => s.templateStepId === 'ts-1');
		expect(updated?.stepName).toBe('Get Military ID');
		expect(updated?.sortOrder).toBe(5);
		// Progress and notes preserved
		expect(updated?.completed).toBe(true);
		expect(updated?.notes).toHaveLength(1);
	});

	it('resets paperwork currentStage when stage no longer exists in updated stages', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template has updated stages that no longer include 'submitted'
		seedTemplateSteps(ctx, [
			{
				id: 'ts-2',
				template_id: 'tmpl-1',
				name: 'CAC Request',
				description: 'Submit CAC form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['draft', 'review', 'done'],
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx, [
			{
				id: 'sp-2',
				onboarding_id: 'ob-1',
				template_step_id: 'ts-2',
				step_name: 'CAC Request',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'approved'],
				sort_order: 1,
				completed: false,
				current_stage: 'submitted',
				notes: [],
				active: true,
				organization_id: 'test-org'
			}
		]);

		const result = await resyncOnboarding(ctx, 'ob-1');

		const step = result.steps.find((s) => s.templateStepId === 'ts-2');
		expect(step?.stages).toEqual(['draft', 'review', 'done']);
		expect(step?.currentStage).toBe('draft');
		expect(step?.completed).toBe(false);
	});

	it('preserves paperwork currentStage when stage still exists in updated stages', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template adds a new stage but keeps 'submitted'
		seedTemplateSteps(ctx, [
			{
				id: 'ts-2',
				template_id: 'tmpl-1',
				name: 'CAC Request',
				description: 'Submit CAC form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'reviewed', 'approved'],
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx, [
			{
				id: 'sp-2',
				onboarding_id: 'ob-1',
				template_step_id: 'ts-2',
				step_name: 'CAC Request',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'approved'],
				sort_order: 1,
				completed: false,
				current_stage: 'submitted',
				notes: [],
				active: true,
				organization_id: 'test-org'
			}
		]);

		const result = await resyncOnboarding(ctx, 'ob-1');

		const step = result.steps.find((s) => s.templateStepId === 'ts-2');
		expect(step?.currentStage).toBe('submitted');
		// Was at last stage before ('approved' was 3rd of 3), now it's not last (4 stages)
		// But completed was false already so stays false
		expect(step?.completed).toBe(false);
	});

	it('resets completed to false when paperwork was at last stage but stage list changed', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template changes stages so 'approved' is no longer a valid stage
		seedTemplateSteps(ctx, [
			{
				id: 'ts-2',
				template_id: 'tmpl-1',
				name: 'CAC Request',
				description: 'Submit CAC form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['draft', 'review', 'finalized'],
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx, [
			{
				id: 'sp-2',
				onboarding_id: 'ob-1',
				template_step_id: 'ts-2',
				step_name: 'CAC Request',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'approved'],
				sort_order: 1,
				completed: true,
				current_stage: 'approved',
				notes: [],
				active: true,
				organization_id: 'test-org'
			}
		]);

		const result = await resyncOnboarding(ctx, 'ob-1');

		const step = result.steps.find((s) => s.templateStepId === 'ts-2');
		expect(step?.currentStage).toBe('draft');
		expect(step?.completed).toBe(false);
	});

	it('blocks resync when onboarding is completed', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'completed' });

		await expect(resyncOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be resynced');
	});

	it('blocks resync when onboarding is cancelled', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'cancelled' });

		await expect(resyncOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be resynced');
	});

	it('blocks resync when template_id is null (template was deleted)', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { template_id: null });

		await expect(resyncOnboarding(ctx, 'ob-1')).rejects.toThrow('Cannot resync: template has been deleted');
	});

	it('blocks resync when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedOnboarding(ctx);

		await expect(resyncOnboarding(ctx, 'ob-1')).rejects.toThrow('Organization is in read-only mode');
	});

	it('requires full-editor permission', async () => {
		const ctx = buildContext();
		const auth = createTestAuthContext({
			isFullEditor: false,
			requireFullEditor() {
				throw new Error('Full editor access required');
			}
		});
		ctx.auth = auth;
		seedOnboarding(ctx);

		await expect(resyncOnboarding(ctx, 'ob-1')).rejects.toThrow('Full editor access required');
	});

	it('emits audit log on successful resync', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);

		await resyncOnboarding(ctx, 'ob-1');

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'onboarding.resynced',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1'
		});
	});

	it('handles combined add, update, and deactivate in single resync', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		// Template: ts-1 updated name, ts-3 removed, ts-4 added
		seedTemplateSteps(ctx, [
			{
				id: 'ts-1',
				template_id: 'tmpl-1',
				name: 'Updated ID card step',
				description: 'New desc',
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
				description: 'Submit CAC form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'approved'],
				sort_order: 1,
				organization_id: 'test-org'
			},
			{
				id: 'ts-4',
				template_id: 'tmpl-1',
				name: 'New Step',
				description: 'Brand new',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 3,
				organization_id: 'test-org'
			}
		]);
		seedInstanceSteps(ctx); // has ts-1, ts-2, ts-3

		const result = await resyncOnboarding(ctx, 'ob-1');

		// ts-1 updated
		const updated = result.steps.find((s) => s.templateStepId === 'ts-1');
		expect(updated?.stepName).toBe('Updated ID card step');
		expect(updated?.active).toBe(true);

		// ts-2 unchanged
		const unchanged = result.steps.find((s) => s.templateStepId === 'ts-2');
		expect(unchanged?.active).toBe(true);

		// ts-3 deactivated
		const deactivated = result.steps.find((s) => s.templateStepId === 'ts-3');
		expect(deactivated?.active).toBe(false);

		// ts-4 added
		const added = result.steps.find((s) => s.templateStepId === 'ts-4');
		expect(added?.stepName).toBe('New Step');
		expect(added?.active).toBe(true);
		expect(added?.completed).toBe(false);
	});

	it('rejects resync when onboarding not found', async () => {
		const ctx = buildContext();

		await expect(resyncOnboarding(ctx, 'nonexistent')).rejects.toThrow('Onboarding not found');
	});
});

describe('switchTemplate', () => {
	it('updates template_id and runs diff against new template', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx); // template_id: tmpl-1
		seedInstanceSteps(ctx); // steps from tmpl-1

		// New template (tmpl-2) with different steps
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'ts-new-1',
				template_id: 'tmpl-2',
				name: 'Barracks Assignment',
				description: 'Get room key',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: 'ts-new-2',
				template_id: 'tmpl-2',
				name: 'Vehicle Registration',
				description: 'Register POV',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['submitted', 'approved'],
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);

		const result = await switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' });

		expect(result.templateId).toBe('tmpl-2');

		// All old steps should be deactivated (none match tmpl-2 template_step_ids)
		const oldSteps = result.steps.filter((s) => ['ts-1', 'ts-2', 'ts-3'].includes(s.templateStepId!));
		for (const step of oldSteps) {
			expect(step.active).toBe(false);
		}

		// New steps inserted
		const newStep1 = result.steps.find((s) => s.templateStepId === 'ts-new-1');
		expect(newStep1?.stepName).toBe('Barracks Assignment');
		expect(newStep1?.active).toBe(true);

		const newStep2 = result.steps.find((s) => s.templateStepId === 'ts-new-2');
		expect(newStep2?.stepName).toBe('Vehicle Registration');
		expect(newStep2?.currentStage).toBe('submitted');
	});

	it('blocks switch when onboarding is completed', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'completed' });

		await expect(switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' })).rejects.toThrow(
			'Only in-progress onboardings can switch templates'
		);
	});

	it('blocks switch when onboarding is cancelled', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { status: 'cancelled' });

		await expect(switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' })).rejects.toThrow(
			'Only in-progress onboardings can switch templates'
		);
	});

	it('blocks switch when template_id is null', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { template_id: null });

		await expect(switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' })).rejects.toThrow(
			'Cannot switch template: current template has been deleted'
		);
	});

	it('blocks switch when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedOnboarding(ctx);

		await expect(switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' })).rejects.toThrow(
			'Organization is in read-only mode'
		);
	});

	it('requires full-editor permission', async () => {
		const ctx = buildContext();
		const auth = createTestAuthContext({
			isFullEditor: false,
			requireFullEditor() {
				throw new Error('Full editor access required');
			}
		});
		ctx.auth = auth;
		seedOnboarding(ctx);

		await expect(switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' })).rejects.toThrow(
			'Full editor access required'
		);
	});

	it('emits audit log on template switch', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);

		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'ts-new-1',
				template_id: 'tmpl-2',
				name: 'New Step',
				description: 'Desc',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);

		await switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' });

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'onboarding.template_switched',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1',
			details: { oldTemplateId: 'tmpl-1', newTemplateId: 'tmpl-2' }
		});
	});

	it('rejects switch when onboarding not found', async () => {
		const ctx = buildContext();

		await expect(switchTemplate(ctx, { onboardingId: 'nonexistent', newTemplateId: 'tmpl-2' })).rejects.toThrow(
			'Onboarding not found'
		);
	});
});
