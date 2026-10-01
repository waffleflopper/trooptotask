import { describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { resyncOnboarding, switchTemplate } from './onboardingResync.server';

const operateOnlyCapabilityMap: CapabilityMap = {
	calendar: 'none',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

function buildContext() {
	return createWritePortsContext();
}

function seedOnboarding(ctx: ReturnType<typeof buildContext>, overrides?: Record<string, unknown>) {
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

function seedTemplateSteps(ctx: ReturnType<typeof buildContext>, steps?: Record<string, unknown>[]) {
	ctx.store.seed('onboarding_templates', [{ id: 'tmpl-1', organization_id: 'test-org', name: 'Packet template' }]);
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

function seedInstanceSteps(ctx: ReturnType<typeof buildContext>, steps?: Record<string, unknown>[]) {
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
	it('returns reordered and newly inserted steps in their saved display order', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);
		await ctx.store.update('onboarding_template_steps', 'test-org', 'ts-1', { sort_order: 2 });
		await ctx.store.update('onboarding_template_steps', 'test-org', 'ts-3', { sort_order: 0 });
		await ctx.store.insert('onboarding_template_steps', 'test-org', {
			id: 'ts-new-first',
			template_id: 'tmpl-1',
			name: 'New first task',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: -1
		});

		const result = await resyncOnboarding(ctx, 'ob-1');

		expect(result.steps.map((step) => step.templateStepId)).toEqual(['ts-new-first', 'ts-3', 'ts-2', 'ts-1']);
		expect(result.steps.map((step) => step.sortOrder)).toEqual([-1, 0, 1, 2]);
		expect(result.steps[3]).toMatchObject({ id: 'sp-1', completed: true, notes: [{ text: 'Called badge office' }] });
	});

	it('retains null-reference work and already inactive history in every response without adopting a replacement by name', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);
		// PostgreSQL clears this reference when its template definition is deleted.
		await ctx.store.update('onboarding_step_progress', 'test-org', 'sp-1', { template_step_id: null });
		await ctx.store.delete('onboarding_template_steps', 'test-org', 'ts-1');
		await ctx.store.insert('onboarding_template_steps', 'test-org', {
			id: 'ts-replacement',
			template_id: 'tmpl-1',
			name: 'Get ID card',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0
		});
		const notes = [{ text: 'Called badge office', timestamp: '2026-03-01T00:00:00Z', userId: 'user-1' }];
		await ctx.store.insert('onboarding_step_progress', 'test-org', {
			id: 'sp-history',
			onboarding_id: 'ob-1',
			template_step_id: null,
			step_name: 'Historical task',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 10,
			completed: true,
			current_stage: null,
			notes,
			active: false
		});

		const first = await resyncOnboarding(ctx, 'ob-1');
		expect(first.steps.find((step) => step.id === 'sp-1')).toMatchObject({
			templateStepId: null,
			completed: true,
			active: false,
			notes
		});
		expect(first.steps.find((step) => step.id === 'sp-history')).toMatchObject({
			completed: true,
			active: false,
			notes
		});
		expect(first.steps.find((step) => step.templateStepId === 'ts-replacement')).toMatchObject({
			stepName: 'Get ID card',
			completed: false,
			active: true,
			notes: []
		});
		expect(first.steps).toHaveLength(5);

		const repeated = await resyncOnboarding(ctx, 'ob-1');
		expect(repeated.steps).toEqual(first.steps);
		const saved = await ctx.store.findMany<{ id: string; active: boolean }>('onboarding_step_progress', 'test-org', {
			onboarding_id: 'ob-1'
		});
		expect(saved).toHaveLength(5);
		expect(saved.find((step) => step.id === 'sp-1')?.active).toBe(false);
	});

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

	it('requires Onboarding configure policy before resyncing', async () => {
		const ctx = createWritePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: operateOnlyCapabilityMap
			}
		});
		seedOnboarding(ctx);

		await expect(resyncOnboarding(ctx, 'ob-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({
					policyAction: 'onboarding.configureWorkflows',
					reasonCode: 'denied:missing-capability'
				})
			})
		);
	});

	it('emits audit log on successful resync', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);

		await resyncOnboarding(ctx, 'ob-1');

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
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

	it('updates existing steps and adds new template steps during resync', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx);
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
				name: 'Updated CAC Request',
				description: 'Submit CAC form',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['draft', 'review', 'approved'],
				sort_order: 1,
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
				sort_order: 2,
				organization_id: 'test-org'
			},
			{
				id: 'ts-5',
				template_id: 'tmpl-1',
				name: 'New Paperwork',
				description: 'Start new packet',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['started', 'complete'],
				sort_order: 3,
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
				completed: true,
				current_stage: 'submitted',
				notes: [],
				active: true,
				organization_id: 'test-org'
			}
		]);
		const result = await resyncOnboarding(ctx, 'ob-1');

		expect(result.steps).toHaveLength(4);
		expect(result.steps.find((s) => s.templateStepId === 'ts-1')?.stepName).toBe('Updated ID card step');
		expect(result.steps.find((s) => s.templateStepId === 'ts-2')?.currentStage).toBe('draft');
		expect(result.steps.find((s) => s.templateStepId === 'ts-4')?.active).toBe(true);
		expect(result.steps.find((s) => s.templateStepId === 'ts-5')?.currentStage).toBe('started');
	});

	it('rejects resync when onboarding not found', async () => {
		const ctx = buildContext();

		await expect(resyncOnboarding(ctx, 'nonexistent')).rejects.toThrow('Onboarding not found');
	});
});

describe('switchTemplate', () => {
	it('retains matching legacy IDs and work when retrying after a failed progress write', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { template_id: null });
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);
		for (const id of ['sp-1', 'sp-2', 'sp-3']) {
			await ctx.store.update('onboarding_step_progress', 'test-org', id, { template_step_id: null });
		}
		vi.spyOn(ctx.store, 'upsertMany').mockRejectedValueOnce(new Error('Progress persistence unavailable'));
		const input = { onboardingId: 'ob-1', newTemplateId: 'tmpl-1' };

		await expect(switchTemplate(ctx, input)).rejects.toThrow('Progress persistence unavailable');
		await expect(ctx.store.findOne('personnel_onboardings', 'test-org', { id: 'ob-1' })).resolves.toMatchObject({
			template_id: null
		});
		const retry = await switchTemplate(ctx, input);

		expect(retry.steps.find((step) => step.templateStepId === 'ts-1')).toMatchObject({
			id: 'sp-1',
			completed: true,
			active: true,
			notes: [{ text: 'Called badge office' }]
		});
		expect(retry.steps.find((step) => step.templateStepId === 'ts-2')).toMatchObject({
			id: 'sp-2',
			currentStage: 'submitted',
			completed: false,
			active: true
		});
		expect(retry.steps).toHaveLength(3);
	});

	it.each(['new steps', 'parent assignment'] as const)(
		'retries legacy assignment after %s fail without duplicating adopted work',
		async (failure) => {
			const ctx = buildContext();
			seedOnboarding(ctx, { template_id: null });
			seedTemplateSteps(ctx);
			seedInstanceSteps(ctx);
			for (const id of ['sp-1', 'sp-2', 'sp-3']) {
				await ctx.store.update('onboarding_step_progress', 'test-org', id, { template_step_id: null });
			}
			await ctx.store.insert('onboarding_template_steps', 'test-org', {
				id: 'ts-extra',
				template_id: 'tmpl-1',
				name: 'Fresh task',
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 3
			});
			if (failure === 'new steps')
				vi.spyOn(ctx.store, 'insertMany').mockRejectedValueOnce(new Error('Persistence unavailable'));
			else vi.spyOn(ctx.store, 'update').mockRejectedValueOnce(new Error('Persistence unavailable'));
			const input = { onboardingId: 'ob-1', newTemplateId: 'tmpl-1' };

			await expect(switchTemplate(ctx, input)).rejects.toThrow('Persistence unavailable');
			await expect(ctx.store.findOne('personnel_onboardings', 'test-org', { id: 'ob-1' })).resolves.toMatchObject({
				template_id: null
			});
			// Adopted references may have committed; that partial progress is reused by retry.
			await expect(ctx.store.findOne('onboarding_step_progress', 'test-org', { id: 'sp-1' })).resolves.toMatchObject({
				template_step_id: 'ts-1',
				completed: true,
				notes: [{ text: 'Called badge office' }]
			});
			const retry = await switchTemplate(ctx, input);

			expect(retry.steps.map((step) => step.id).slice(0, 3)).toEqual(['sp-1', 'sp-2', 'sp-3']);
			expect(retry.steps).toHaveLength(4);
			expect(retry.steps[0]).toMatchObject({ completed: true, notes: [{ text: 'Called badge office' }] });
			expect(retry.steps[1]).toMatchObject({ currentStage: 'submitted', completed: false });
			expect(retry.steps[3]).toMatchObject({ templateStepId: 'ts-extra', completed: false, notes: [] });
			await expect(
				ctx.store.findMany('onboarding_step_progress', 'test-org', { onboarding_id: 'ob-1' })
			).resolves.toHaveLength(4);
		}
	);

	it('rejects a foreign template before changing legacy work', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { template_id: null });
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);
		ctx.store.seed('onboarding_templates', [
			{ id: 'tmpl-foreign', organization_id: 'foreign-org', name: 'Foreign template' }
		]);
		const before = await ctx.store.findMany('onboarding_step_progress', 'test-org');

		await expect(switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-foreign' })).rejects.toMatchObject({
			status: 404
		});

		await expect(ctx.store.findOne('personnel_onboardings', 'test-org', { id: 'ob-1' })).resolves.toMatchObject({
			template_id: null
		});
		await expect(ctx.store.findMany('onboarding_step_progress', 'test-org')).resolves.toEqual(before);
	});

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

	it('assigns a first template by exact legacy name/type while preserving IDs, work and notes without duplication on repeat', async () => {
		const ctx = buildContext();
		seedOnboarding(ctx, { template_id: null });
		seedTemplateSteps(ctx);
		seedInstanceSteps(ctx);
		const notes = [{ text: 'Legacy retained work', timestamp: '2026-03-01T00:00:00Z', userId: 'author-1' }];
		await ctx.store.update('onboarding_template_steps', 'test-org', 'ts-1', { name: 'Orientation' });
		await ctx.store.update('onboarding_template_steps', 'test-org', 'ts-2', {
			name: 'Paperwork',
			stages: ['Submitted', 'Reviewed', 'Filed']
		});
		await ctx.store.update('onboarding_step_progress', 'test-org', 'sp-1', {
			template_step_id: null,
			step_name: 'Orientation',
			notes
		});
		await ctx.store.update('onboarding_step_progress', 'test-org', 'sp-2', {
			template_step_id: null,
			step_name: 'Paperwork',
			stages: ['Submitted', 'Reviewed', 'Filed'],
			current_stage: 'Reviewed',
			notes
		});
		await ctx.store.update('onboarding_step_progress', 'test-org', 'sp-3', {
			template_step_id: null,
			step_name: 'Historic task',
			completed: true,
			notes
		});
		await ctx.store.insert('onboarding_step_progress', 'test-org', {
			id: 'sp-wrong-type',
			onboarding_id: 'ob-1',
			template_step_id: null,
			step_name: 'Orientation',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['Submitted'],
			sort_order: 5,
			completed: true,
			current_stage: 'Submitted',
			notes,
			active: true
		});

		await ctx.store.insert('onboarding_step_progress', 'test-org', {
			id: 'sp-inactive-match',
			onboarding_id: 'ob-1',
			template_step_id: null,
			step_name: 'Orientation',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 6,
			completed: true,
			current_stage: null,
			notes,
			active: false
		});

		const first = await switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-1' });
		expect(first.steps.find((step) => step.id === 'sp-1')).toMatchObject({
			templateStepId: 'ts-1',
			completed: true,
			active: true,
			notes
		});
		expect(first.steps.find((step) => step.id === 'sp-2')).toMatchObject({
			templateStepId: 'ts-2',
			completed: false,
			currentStage: 'Reviewed',
			active: true,
			notes
		});
		expect(first.steps.find((step) => step.id === 'sp-3')).toMatchObject({
			templateStepId: null,
			completed: true,
			active: false,
			notes
		});
		expect(first.steps.find((step) => step.id === 'sp-wrong-type')).toMatchObject({
			templateStepId: null,
			completed: true,
			active: false,
			notes
		});
		expect(first.steps.find((step) => step.templateStepId === 'ts-3')).toMatchObject({
			completed: false,
			active: true,
			notes: []
		});
		expect(first.steps.find((step) => step.id === 'sp-inactive-match')).toMatchObject({
			templateStepId: null,
			completed: true,
			active: false,
			notes
		});

		expect(first.steps).toHaveLength(6);
		await expect(ctx.store.findOne('personnel_onboardings', 'test-org', { id: 'ob-1' })).resolves.toMatchObject({
			template_id: 'tmpl-1'
		});

		const repeated = await switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-1' });
		expect(repeated.steps).toEqual(first.steps);
		await expect(
			ctx.store.findMany('onboarding_step_progress', 'test-org', { onboarding_id: 'ob-1' })
		).resolves.toHaveLength(6);
		expect(ctx.audit.events[0]).toMatchObject({ details: { oldTemplateId: null, newTemplateId: 'tmpl-1' } });
	});

	it('requires Onboarding configure policy before switching templates', async () => {
		const ctx = createWritePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: operateOnlyCapabilityMap
			}
		});
		seedOnboarding(ctx);

		await expect(switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'tmpl-2' })).rejects.toMatchObject({
			status: 403
		});
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

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
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
