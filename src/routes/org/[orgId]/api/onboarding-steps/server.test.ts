import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _putConfig } from './+server';

function seedOnboardingStep(
	ctx: ReturnType<typeof createTestContext>,
	overrides?: Partial<{
		id: string;
		onboarding_id: string;
		step_name: string;
		step_type: 'checkbox' | 'paperwork' | 'training';
		training_type_id: string | null;
		stages: string[] | null;
		sort_order: number;
		completed: boolean;
		current_stage: string | null;
		notes: Array<{ text: string; timestamp: string; userId: string }>;
		template_step_id: string;
		active: boolean;
		organization_id: string;
	}>
) {
	ctx.store.seed('personnel_onboardings', [
		{
			id: 'ob-1',
			personnel_id: 'p-1',
			template_id: 'tmpl-1',
			status: 'in_progress',
			started_at: '2026-01-01T00:00:00Z',
			completed_at: null,
			cancelled_at: null,
			organization_id: 'test-org'
		}
	]);
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

describe('/api/onboarding-steps route config', () => {
	it('uses policy-first route configs for onboarding step mutations', () => {
		for (const config of [_putConfig, _deleteConfig]) {
			expect('permission' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.manageWorkflows);
			expect(config.policyResource).toEqual({ kind: 'unscoped' });
		}
	});

	it('allows onboarding operators to toggle step progress through the policy decision', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'operate',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedOnboardingStep(ctx);

		const result = await handleUseCaseRequest(
			_putConfig,
			ctx,
			{
				action: 'toggleCheckbox',
				stepId: 'step-1',
				completed: true
			},
			() => ctx
		);

		expect(result).toMatchObject({
			id: 'step-1',
			completed: true
		});
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'onboarding_step.toggled',
				resourceId: 'step-1'
			})
		);
	});

	it('returns authoritative saved notes for an operator using the existing addNote action and body', async () => {
		const saved = {
			id: 'step-1',
			notes: [
				{ text: 'Another committed note', timestamp: '2026-10-01T12:00:00.001Z', userId: 'other-author' },
				{ text: 'Sent to clinic', timestamp: '2026-10-01T12:00:00.002Z', userId: 'operator' }
			]
		};
		const ctx = createTestContext({
			auth: {
				userId: 'operator',
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'operate',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			},
			onboardingNoteAppend: {
				async append(orgId, stepId, text) {
					expect({ orgId, stepId, text }).toEqual({ orgId: 'test-org', stepId: 'step-1', text: 'Sent to clinic' });
					return saved;
				}
			}
		});
		seedOnboardingStep(ctx, { active: false });
		ctx.store.seed('personnel', [
			{ id: 'p-1', organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: null }
		]);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					action: 'addNote',
					stepId: 'step-1',
					text: 'Sent to clinic'
				},
				() => ctx
			)
		).resolves.toEqual(saved);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'onboarding_step.note_added',
				resourceId: 'step-1',
				details: { note_author_user_id: 'operator' }
			})
		);
	});

	it('propagates a failed note append without a success audit', async () => {
		const failure = new Error('Note append unavailable');
		const ctx = createTestContext({
			onboardingNoteAppend: {
				append: async () => {
					throw failure;
				}
			}
		});
		seedOnboardingStep(ctx);

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					action: 'addNote',
					stepId: 'step-1',
					text: 'Sent to clinic'
				},
				() => ctx
			)
		).rejects.toBe(failure);
		expect(ctx.auditPort.events).not.toContainEqual(expect.objectContaining({ action: 'onboarding_step.note_added' }));
	});

	it('allows a scoped Onboarding-only operator to remove completed inactive work on a terminal packet', async () => {
		const ctx = createTestContext({
			onboardingInactiveStepRemoval: {
				async remove(orgId, stepId) {
					// Explicit sequential fixture persistence; provider atomicity has separate live proof.
					await ctx.store.delete('onboarding_step_progress', orgId, stepId);
					return { id: stepId };
				}
			},
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'operate',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});
		seedOnboardingStep(ctx, { id: 'inactive-step-1', active: false, completed: true });
		ctx.store.seed('personnel', [
			{ id: 'p-1', organization_id: ctx.auth.orgId, group_id: 'group-alpha', archived_at: null }
		]);
		await ctx.store.update('personnel_onboardings', ctx.auth.orgId, 'ob-1', { status: 'completed' });

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'inactive-step-1' }, () => ctx)).resolves.toEqual({
			success: true
		});
		await expect(
			ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'inactive-step-1' })
		).resolves.toBeNull();
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'onboarding_step.inactive_removed',
				resourceId: 'inactive-step-1'
			})
		);
	});

	it('rejects a reactivated step with 409 and preserves its saved work without a removal audit', async () => {
		const notes = [{ text: 'Retained work', timestamp: '2026-09-01T12:00:00.000Z', userId: 'author' }];
		const ctx = createTestContext({
			onboardingInactiveStepRemoval: {
				async remove() {
					// Arrange the owned provider's no-match outcome and the now-active fixture, not a lock algorithm.
					await ctx.store.update('onboarding_step_progress', ctx.auth.orgId, 'step-1', { active: true });
					return null;
				}
			}
		});
		seedOnboardingStep(ctx, {
			active: false,
			step_type: 'paperwork',
			stages: ['Submitted', 'Reviewed', 'Filed'],
			current_stage: 'Reviewed',
			notes
		});

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'step-1' }, () => ctx)).rejects.toMatchObject({
			status: 409
		});

		await expect(
			ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' })
		).resolves.toMatchObject({
			id: 'step-1',
			active: true,
			completed: false,
			current_stage: 'Reviewed',
			notes
		});
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({ action: 'onboarding_step.inactive_removed' })
		);
	});

	it('preserves a provider deletion failure and retained progress instead of returning success', async () => {
		const failure = new Error('Delete rejected by provider');
		const ctx = createTestContext({
			onboardingInactiveStepRemoval: {
				async remove() {
					throw failure;
				}
			}
		});
		seedOnboardingStep(ctx, {
			active: false,
			completed: true,
			notes: [{ text: 'Retained history', timestamp: '2026-09-01T12:00:00.000Z', userId: 'author' }]
		});
		const before = await ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' });

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'step-1' }, () => ctx)).rejects.toBe(failure);

		await expect(ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' })).resolves.toEqual(
			before
		);
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({ action: 'onboarding_step.inactive_removed' })
		);
	});

	it('denies a valid inactive DELETE for a viewer before contacting persistence', async () => {
		const remove = vi.fn(async () => ({ id: 'step-1' }));
		const ctx = createTestContext({
			onboardingInactiveStepRemoval: { remove },
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedOnboardingStep(ctx, { active: false });

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'step-1' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(remove).not.toHaveBeenCalled();
		await expect(
			ctx.rawStore.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' })
		).resolves.not.toBeNull();
	});

	it('returns 404 for a foreign Organization step without contacting persistence or changing its work', async () => {
		const remove = vi.fn(async () => ({ id: 'foreign-step' }));
		const ctx = createTestContext({ onboardingInactiveStepRemoval: { remove } });
		seedOnboardingStep(ctx, { id: 'foreign-step', active: false, organization_id: 'foreign-org' });
		const before = await ctx.rawStore.findOne('onboarding_step_progress', 'foreign-org', { id: 'foreign-step' });

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'foreign-step' }, () => ctx)).rejects.toMatchObject({
			status: 404
		});
		expect(remove).not.toHaveBeenCalled();
		await expect(
			ctx.rawStore.findOne('onboarding_step_progress', 'foreign-org', { id: 'foreign-step' })
		).resolves.toEqual(before);
		expect(ctx.auditPort.events).not.toContainEqual(
			expect.objectContaining({ action: 'onboarding_step.inactive_removed' })
		);
	});

	it('denies onboarding step mutations before use-case execution when policy is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(
				_putConfig,
				ctx,
				{
					action: 'toggleCheckbox',
					stepId: 'step-1',
					completed: true
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'onboarding.manageWorkflows'
			})
		]);
	});
});
