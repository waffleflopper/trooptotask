import { describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import type { OnboardingReconciliationResult } from '../contracts';
import { resyncOnboarding, switchTemplate } from './onboardingResync.server';

const configureCapabilityMap: CapabilityMap = {
	calendar: 'none',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'configure',
	ratingScheme: 'none'
};

function savedResult(): OnboardingReconciliationResult {
	return {
		onboarding_id: 'ob-1',
		template_id: 'template-current',
		old_template_id: 'template-previous',
		steps: [
			{
				id: 'saved-paperwork',
				onboarding_id: 'ob-1',
				template_step_id: 'definition-paperwork',
				step_name: 'Paperwork',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['Draft', 'Submitted'],
				sort_order: 0,
				completed: false,
				current_stage: 'Submitted',
				notes: [{ text: 'Sent to clinic', timestamp: '2026-09-01T12:00:00Z', userId: 'author-1' }],
				active: true
			},
			{
				id: 'saved-history',
				onboarding_id: 'ob-1',
				template_step_id: null,
				step_name: 'Deleted training',
				step_type: 'training',
				training_type_id: 'training-1',
				stages: null,
				sort_order: 2,
				completed: true,
				current_stage: null,
				notes: [{ text: 'Previously completed', timestamp: '2026-08-01T12:00:00Z', userId: 'author-2' }],
				active: false
			}
		]
	};
}

function context(options?: Parameters<typeof createWritePortsContext>[0], groupId = 'group-alpha') {
	const ctx = createWritePortsContext(options);
	ctx.store.seed('personnel_onboardings', [
		{ id: 'ob-1', personnel_id: 'person-1', template_id: 'stale-template', organization_id: ctx.auth.orgId }
	]);
	ctx.store.seed('personnel', [
		{ id: 'person-1', group_id: groupId, organization_id: ctx.auth.orgId, archived_at: null }
	]);
	return ctx;
}

const operations = [
	{ name: 'resync', run: (ctx: Parameters<typeof resyncOnboarding>[0]) => resyncOnboarding(ctx, 'ob-1') },
	{
		name: 'switch',
		run: (ctx: Parameters<typeof resyncOnboarding>[0]) =>
			switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'template-current' })
	}
];

describe('Onboarding reconciliation application boundary', () => {
	it('returns saved progress and inactive history using the existing camel-case API contract', async () => {
		const ctx = context({ onboardingReconciliation: { reconcile: async () => savedResult() } });
		await expect(resyncOnboarding(ctx, 'ob-1')).resolves.toEqual({
			onboardingId: 'ob-1',
			templateId: 'template-current',
			steps: [
				{
					id: 'saved-paperwork',
					onboardingId: 'ob-1',
					templateStepId: 'definition-paperwork',
					stepName: 'Paperwork',
					stepType: 'paperwork',
					trainingTypeId: null,
					stages: ['Draft', 'Submitted'],
					sortOrder: 0,
					completed: false,
					currentStage: 'Submitted',
					notes: [{ text: 'Sent to clinic', timestamp: '2026-09-01T12:00:00Z', userId: 'author-1' }],
					active: true
				},
				{
					id: 'saved-history',
					onboardingId: 'ob-1',
					templateStepId: null,
					stepName: 'Deleted training',
					stepType: 'training',
					trainingTypeId: 'training-1',
					stages: null,
					sortOrder: 2,
					completed: true,
					currentStage: null,
					notes: [{ text: 'Previously completed', timestamp: '2026-08-01T12:00:00Z', userId: 'author-2' }],
					active: false
				}
			]
		});
	});

	it('resyncs the locked current template and audits that result instead of a stale policy lookup', async () => {
		const reconcile = vi.fn(async () => savedResult());
		const ctx = context({ auth: { orgId: 'organization-b' }, onboardingReconciliation: { reconcile } });
		await resyncOnboarding(ctx, 'ob-1');
		expect(reconcile).toHaveBeenCalledWith('organization-b', 'ob-1', null);
		expect(ctx.audit.events).toEqual([
			{
				action: 'onboarding.resynced',
				resourceType: 'personnel_onboarding',
				resourceId: 'ob-1',
				details: { templateId: 'template-current' }
			}
		]);
	});

	it.each(['template-previous', null])('audits the locked old template %s when switching', async (oldTemplateId) => {
		const reconcile = vi.fn(async () => ({ ...savedResult(), old_template_id: oldTemplateId }));
		const ctx = context({ onboardingReconciliation: { reconcile } });
		await switchTemplate(ctx, { onboardingId: 'ob-1', newTemplateId: 'template-current' });
		expect(reconcile).toHaveBeenCalledWith('test-org', 'ob-1', 'template-current');
		expect(ctx.audit.events).toEqual([
			{
				action: 'onboarding.template_switched',
				resourceType: 'personnel_onboarding',
				resourceId: 'ob-1',
				details: { oldTemplateId, newTemplateId: 'template-current' }
			}
		]);
	});

	it.each(operations)('denies $name before persistence without configure capability', async ({ run }) => {
		const reconcile = vi.fn(async () => savedResult());
		const ctx = context({
			onboardingReconciliation: { reconcile },
			auth: { role: 'member', isPrivileged: false, capabilityMap: { ...configureCapabilityMap, onboarding: 'operate' } }
		});
		await expect(run(ctx)).rejects.toMatchObject({ status: 403 });
		expect(reconcile).not.toHaveBeenCalled();
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ policyAction: 'onboarding.configureWorkflows' })
			})
		);
	});

	it.each(operations)('denies $name before persistence for an out-of-scope Person', async ({ run }) => {
		const reconcile = vi.fn(async () => savedResult());
		const ctx = context(
			{
				onboardingReconciliation: { reconcile },
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: configureCapabilityMap,
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			},
			'group-bravo'
		);
		await expect(run(ctx)).rejects.toMatchObject({ status: 403 });
		expect(reconcile).not.toHaveBeenCalled();
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ policyAction: 'onboarding.manageWorkflows' })
			})
		);
	});

	it('allows a configurator to reconcile an in-scope Person', async () => {
		const ctx = context({
			onboardingReconciliation: { reconcile: async () => savedResult() },
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: configureCapabilityMap,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});
		await resyncOnboarding(ctx, 'ob-1');
		expect(ctx.audit.events).toContainEqual(expect.objectContaining({ action: 'onboarding.resynced' }));
	});

	it.each(operations)('does not emit a success audit when $name persistence fails', async ({ run }) => {
		const ctx = context({
			onboardingReconciliation: {
				reconcile: async () => {
					throw new Error('Database unavailable');
				}
			}
		});
		await expect(run(ctx)).rejects.toThrow('Database unavailable');
		expect(ctx.audit.events).toEqual([]);
	});

	it.each(operations)('fails explicitly for $name without a bound owned provider', async ({ run }) => {
		const ctx = context();
		await expect(run(ctx)).rejects.toThrow('Bind the owned Onboarding reconciliation provider');
		const missingContext = { ...ctx, onboardingReconciliation: undefined };
		await expect(run(missingContext)).rejects.toThrow('Bind the owned Onboarding reconciliation provider');
		expect(ctx.audit.events).toEqual([]);
	});
});
