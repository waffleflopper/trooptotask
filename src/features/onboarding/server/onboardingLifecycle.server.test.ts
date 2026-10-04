import { describe, it, expect, vi } from 'vitest';
import {
	createTestContext,
	createWritePortsContext,
	createWriteWithNotificationsPortsContext
} from '$lib/server/adapters/inMemory';
import type {
	OnboardingLifecycleTransitionPort,
	OnboardingLifecycleTransitionResult,
	OnboardingPacketCreationPort,
	OnboardingPacketCreationResult
} from '../contracts';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { startOnboarding, cancelOnboarding, reopenOnboarding, completeOnboarding } from './onboardingLifecycle.server';

const operatorCapabilityMap: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext({
		...overrides,
		auth: { role: 'owner', ...overrides?.auth }
	});
}

const cancelledSaved: OnboardingLifecycleTransitionResult = {
	id: 'ob-1',
	status: 'cancelled',
	cancelled_at: '2026-10-01T12:00:00.123Z',
	completed_at: null
};
const completedSaved: OnboardingLifecycleTransitionResult = {
	id: 'ob-1',
	status: 'completed',
	cancelled_at: null,
	completed_at: '2026-10-01'
};
const reopenedSaved: OnboardingLifecycleTransitionResult = {
	id: 'ob-1',
	status: 'in_progress',
	cancelled_at: null,
	completed_at: null
};

// Controlled provider outcomes exercise orchestration, not database locking or persistence.
function buildTransitionContext(
	saved: OnboardingLifecycleTransitionResult | null,
	overrides?: Parameters<typeof buildContext>[0]
) {
	const transition = vi.fn<OnboardingLifecycleTransitionPort['transition']>().mockResolvedValue(saved);
	const ctx = buildContext({ ...overrides, onboardingLifecycleTransition: { transition } });
	vi.spyOn(ctx.store, 'update').mockRejectedValue(new Error('Generic parent update must not run'));
	return { ...ctx, transition };
}

function seedTemplateWithSteps(ctx: ReturnType<typeof buildContext>) {
	ctx.store.seed('onboarding_templates', [
		{ id: 'tmpl-1', name: 'New Soldier Checklist', organization_id: 'test-org' }
	]);
	ctx.store.seed(
		'onboarding_template_steps',
		[
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
		].reverse()
	);
}

const savedPacket: OnboardingPacketCreationResult = {
	onboarding: {
		id: 'saved-packet',
		personnel_id: 'p-1',
		template_id: 'tmpl-1',
		status: 'in_progress',
		started_at: '2026-03-15',
		completed_at: null,
		cancelled_at: null
	},
	steps: [
		{
			id: 'saved-checkbox',
			onboarding_id: 'saved-packet',
			template_step_id: 'ts-1',
			step_name: 'Get ID card',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			active: true
		},
		{
			id: 'saved-paperwork',
			onboarding_id: 'saved-packet',
			template_step_id: 'ts-2',
			step_name: 'CAC Request',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['with soldier', 'submitted', 'approved'],
			sort_order: 1,
			completed: false,
			current_stage: 'with soldier',
			notes: [],
			active: true
		},
		{
			id: 'saved-training',
			onboarding_id: 'saved-packet',
			template_step_id: 'ts-3',
			step_name: 'CPR Training',
			step_type: 'training',
			training_type_id: 'tt-cpr',
			stages: null,
			sort_order: 2,
			completed: false,
			current_stage: null,
			notes: [],
			active: true
		}
	]
};

// Simple saved outcomes protect application preparation/mapping, not SQL persistence or rollback.
function buildStartContext(overrides?: Parameters<typeof buildContext>[0], saved = savedPacket) {
	const create = vi.fn<OnboardingPacketCreationPort['create']>().mockResolvedValue(saved);
	const ctx = buildContext({ ...overrides, onboardingPacketCreation: { create } });
	ctx.store.seed('personnel', [{ id: 'p-1', group_id: 'g-1', organization_id: 'test-org' }]);
	for (const method of ['insert', 'insertMany', 'delete'] as const) {
		vi.spyOn(ctx.store, method).mockRejectedValue(new Error('Generic Start writes must not run'));
	}
	return { ...ctx, create };
}

describe('startOnboarding', () => {
	it('prepares ordered catalog snapshots and maps the authoritative saved packet and workflow defaults', async () => {
		const ctx = buildStartContext();
		seedTemplateWithSteps(ctx);
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'foreign-definition',
				template_id: 'other-template',
				name: 'Other checklist',
				step_type: 'checkbox',
				sort_order: -1,
				organization_id: 'test-org'
			}
		]);
		const result = await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1', startedAt: '2026-03-14' });

		expect(ctx.create).toHaveBeenCalledWith('test-org', {
			personnelId: 'p-1',
			templateId: 'tmpl-1',
			startedAt: '2026-03-14',
			steps: [
				{
					template_step_id: 'ts-1',
					step_name: 'Get ID card',
					step_type: 'checkbox',
					training_type_id: null,
					stages: null,
					sort_order: 0,
					completed: false
				},
				{
					template_step_id: 'ts-2',
					step_name: 'CAC Request',
					step_type: 'paperwork',
					training_type_id: null,
					stages: ['with soldier', 'submitted', 'approved'],
					sort_order: 1,
					completed: false
				},
				{
					template_step_id: 'ts-3',
					step_name: 'CPR Training',
					step_type: 'training',
					training_type_id: 'tt-cpr',
					stages: null,
					sort_order: 2,
					completed: false
				}
			]
		});
		expect(result).toEqual({
			id: 'saved-packet',
			personnelId: 'p-1',
			templateId: 'tmpl-1',
			status: 'in_progress',
			startedAt: '2026-03-15',
			completedAt: null,
			cancelledAt: null,
			steps: [
				{
					id: 'saved-checkbox',
					onboardingId: 'saved-packet',
					templateStepId: 'ts-1',
					stepName: 'Get ID card',
					stepType: 'checkbox',
					trainingTypeId: null,
					stages: null,
					sortOrder: 0,
					completed: false,
					currentStage: null,
					notes: [],
					active: true
				},
				{
					id: 'saved-paperwork',
					onboardingId: 'saved-packet',
					templateStepId: 'ts-2',
					stepName: 'CAC Request',
					stepType: 'paperwork',
					trainingTypeId: null,
					stages: ['with soldier', 'submitted', 'approved'],
					sortOrder: 1,
					completed: false,
					currentStage: 'with soldier',
					notes: [],
					active: true
				},
				{
					id: 'saved-training',
					onboardingId: 'saved-packet',
					templateStepId: 'ts-3',
					stepName: 'CPR Training',
					stepType: 'training',
					trainingTypeId: 'tt-cpr',
					stages: null,
					sortOrder: 2,
					completed: false,
					currentStage: null,
					notes: [],
					active: true
				}
			]
		});
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'onboarding.started',
				resourceType: 'personnel_onboarding',
				resourceId: 'saved-packet',
				details: { subject_type: 'personnel', subject_id: 'p-1', template_id: 'tmpl-1' }
			})
		]);
	});

	it('defaults omitted dates to the local calendar date before creation', async () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Anchorage';
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));
		try {
			const ctx = buildStartContext();
			seedTemplateWithSteps(ctx);
			await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });
			expect(ctx.create).toHaveBeenCalledWith('test-org', expect.objectContaining({ startedAt: '2026-05-04' }));
		} finally {
			vi.useRealTimers();
			if (originalTimezone === undefined) delete process.env.TZ;
			else process.env.TZ = originalTimezone;
		}
	});

	it.each(['2026-03-15T12:00:00.000Z', '2026-02-31'])(
		'rejects invalid date %s before Training or packet creation',
		async (startedAt) => {
			const ctx = buildStartContext();
			seedTemplateWithSteps(ctx);
			const training = vi.spyOn(ctx.trainingOnboardingReferences, 'completedTypeIds');
			await expect(startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1', startedAt })).rejects.toMatchObject(
				{ status: 400 }
			);
			expect(training).not.toHaveBeenCalled();
			expect(ctx.create).not.toHaveBeenCalled();
			expect(ctx.audit.events).toEqual([]);
		}
	);

	it.each([undefined, null, '', '   ', 42, {}, []])(
		'rejects malformed template %j before catalog/Training/creation',
		async (templateId) => {
			const ctx = buildStartContext();
			seedTemplateWithSteps(ctx);
			const reads = vi.spyOn(ctx.store, 'findMany');
			const training = vi.spyOn(ctx.trainingOnboardingReferences, 'completedTypeIds');
			await expect(
				startOnboarding(ctx, { personnelId: 'p-1', templateId: templateId as string })
			).rejects.toMatchObject({ status: 400 });
			expect(reads.mock.calls.filter(([table]) => table === 'onboarding_template_steps')).toEqual([]);
			expect(training).not.toHaveBeenCalled();
			expect(ctx.create).not.toHaveBeenCalled();
			expect(ctx.audit.events).toEqual([]);
		}
	);

	it('retains the active-packet preflight conflict without a creation attempt', async () => {
		const ctx = buildStartContext();
		seedTemplateWithSteps(ctx);
		seedOnboarding(ctx);
		await expect(startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' })).rejects.toMatchObject({
			status: 409
		});
		expect(ctx.create).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('allows a new packet after a cancelled parent while retaining its saved history', async () => {
		const ctx = buildStartContext();
		seedTemplateWithSteps(ctx);
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });
		await expect(startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' })).resolves.toMatchObject({
			id: 'saved-packet'
		});
		await expect(ctx.store.findOne('personnel_onboardings', 'test-org', { id: 'ob-1' })).resolves.toMatchObject({
			status: 'cancelled',
			cancelled_at: '2026-03-01T00:00:00Z'
		});
	});

	it('waits for Training preflight before creation and does not write after a lookup failure', async () => {
		const ctx = buildStartContext();
		seedTemplateWithSteps(ctx);
		let reject!: (error: Error) => void;
		vi.spyOn(ctx.trainingOnboardingReferences, 'completedTypeIds').mockImplementation(
			() =>
				new Promise((_, fail) => {
					reject = fail;
				})
		);
		const pending = startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });
		const failure = expect(pending).rejects.toThrow('Training unavailable');
		await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
		expect(ctx.create).not.toHaveBeenCalled();
		reject(new Error('Training unavailable'));
		await failure;
		expect(ctx.create).not.toHaveBeenCalled();
		expect(ctx.store.insert).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
		expect(ctx.store.delete).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('uses only the target Person and catalog Training IDs, including expired matching presence', async () => {
		const ctx = buildStartContext();
		seedTemplateWithSteps(ctx);
		ctx.store.seed('training_types', [{ id: 'tt-cpr', name: 'CPR', organization_id: 'test-org' }]);
		ctx.store.seed('personnel_trainings', [
			{
				id: 'expired',
				personnel_id: 'p-1',
				training_type_id: 'tt-cpr',
				expiration_date: '2020-01-01',
				organization_id: 'test-org'
			},
			{ id: 'unrelated', personnel_id: 'p-other', training_type_id: 'tt-cpr', organization_id: 'test-org' }
		]);
		const training = vi.spyOn(ctx.trainingOnboardingReferences, 'completedTypeIds');
		await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });
		expect(training).toHaveBeenCalledWith(ctx.auth, ['p-1'], ['tt-cpr']);
		expect(ctx.create).toHaveBeenCalledWith(
			'test-org',
			expect.objectContaining({
				steps: expect.arrayContaining([expect.objectContaining({ template_step_id: 'ts-3', completed: true })])
			})
		);
	});

	it('does not complete Training from another Person or an unmatched type', async () => {
		const ctx = buildStartContext();
		seedTemplateWithSteps(ctx);
		ctx.store.seed('training_types', [{ id: 'tt-cpr', name: 'CPR', organization_id: 'test-org' }]);
		ctx.store.seed('personnel_trainings', [
			{ id: 'another-person', personnel_id: 'p-other', training_type_id: 'tt-cpr', organization_id: 'test-org' },
			{ id: 'another-type', personnel_id: 'p-1', training_type_id: 'tt-other', organization_id: 'test-org' }
		]);
		await startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' });
		expect(ctx.create).toHaveBeenCalledWith(
			'test-org',
			expect.objectContaining({
				steps: expect.arrayContaining([expect.objectContaining({ template_step_id: 'ts-3', completed: false })])
			})
		);
	});

	it('creates a valid configured empty template without querying Training or requiring snapshots', async () => {
		const ctx = buildStartContext(undefined, { ...savedPacket, steps: [] });
		ctx.store.seed('onboarding_templates', [
			{ id: 'tmpl-1', name: 'Empty configured template', organization_id: 'test-org' }
		]);
		const training = vi.spyOn(ctx.trainingOnboardingReferences, 'completedTypeIds');
		await expect(
			startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1', startedAt: '2026-03-15' })
		).resolves.toMatchObject({ id: 'saved-packet', steps: [] });
		expect(ctx.create).toHaveBeenCalledWith('test-org', {
			personnelId: 'p-1',
			templateId: 'tmpl-1',
			startedAt: '2026-03-15',
			steps: []
		});
		expect(training).not.toHaveBeenCalled();
	});

	it('allows Onboarding-only scoped operation through owned references and denies another Group before creation', async () => {
		const overrides = {
			auth: {
				role: 'member' as const,
				isPrivileged: false,
				capabilityMap: operatorCapabilityMap,
				scopeSet: { kind: 'groups' as const, groupIds: ['g-1'] },
				requireEdit() {
					throw new Error('Legacy edit gate must not run');
				}
			}
		};
		const allowed = buildStartContext(overrides);
		seedTemplateWithSteps(allowed);
		const originalRead = allowed.store.findMany.bind(allowed.store);
		vi.spyOn(allowed.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table === 'personnel' || table === 'personnel_trainings')
				throw new Error('Generic foreign-owner read must not run');
			return originalRead(table, orgId, filters, options);
		});
		await expect(startOnboarding(allowed, { personnelId: 'p-1', templateId: 'tmpl-1' })).resolves.toMatchObject({
			id: 'saved-packet'
		});

		const denied = buildStartContext(overrides);
		denied.store.seed('personnel', [{ id: 'p-2', group_id: 'g-2', organization_id: 'test-org' }]);
		await expect(startOnboarding(denied, { personnelId: 'p-2', templateId: 'tmpl-1' })).rejects.toMatchObject({
			status: 403
		});
		expect(denied.create).not.toHaveBeenCalled();
		expect(denied.audit.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel_onboarding',
				details: expect.objectContaining({ reasonCode: 'denied:out-of-scope' })
			})
		]);
	});

	it('checks Person policy before malformed template admission', async () => {
		const ctx = buildStartContext({
			auth: { role: 'member', isPrivileged: false, capabilityMap: { ...operatorCapabilityMap, onboarding: 'view' } }
		});
		await expect(
			startOnboarding(ctx, { personnelId: 'p-1', templateId: null as unknown as string })
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.create).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([expect.objectContaining({ action: 'policy.denied' })]);
	});

	it.each([
		new Error('Creation failed'),
		Object.assign(new Error('Template unavailable'), { status: 404 }),
		Object.assign(new Error('Concurrent active packet'), { status: 409 })
	])('propagates $message without a success audit or generic fallback', async (error) => {
		const ctx = buildStartContext();
		seedTemplateWithSteps(ctx);
		ctx.create.mockRejectedValue(error);
		await expect(startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' })).rejects.toBe(error);
		expect(ctx.store.insert).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
		expect(ctx.store.delete).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('fails explicitly when no creation provider is bound', async () => {
		const ctx = buildStartContext();
		await expect(
			startOnboarding({ ...ctx, onboardingPacketCreation: undefined }, { personnelId: 'p-1', templateId: 'tmpl-1' })
		).rejects.toThrow('Bind the owned Onboarding packet creation provider');
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([createTestContext, createWritePortsContext, createWriteWithNotificationsPortsContext])(
		'keeps test factories explicitly unavailable without inventing in-memory atomic creation',
		async (factory) => {
			const ctx = factory();
			expect(ctx.onboardingPacketCreation).toBeDefined();
			await expect(startOnboarding(ctx, { personnelId: 'p-1', templateId: 'tmpl-1' })).rejects.toThrow(
				'Bind the owned Onboarding packet creation provider'
			);
		}
	);
});

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

describe('cancelOnboarding', () => {
	it('sets status to cancelled with cancelled_at timestamp', async () => {
		const ctx = buildTransitionContext(cancelledSaved);
		seedOnboarding(ctx);

		const result = await cancelOnboarding(ctx, 'ob-1');

		expect(result.status).toBe('cancelled');
		expect(result.cancelledAt).toBeTruthy();
		expect(new Date(result.cancelledAt!).toISOString()).toBe(result.cancelledAt);
	});

	it('rejects when onboarding not found', async () => {
		const ctx = buildTransitionContext(cancelledSaved);

		await expect(cancelOnboarding(ctx, 'nonexistent')).rejects.toThrow('Onboarding not found');
	});

	it('rejects cancelling a completed onboarding', async () => {
		const ctx = buildTransitionContext(cancelledSaved);
		seedOnboarding(ctx, { status: 'completed', completed_at: '2026-03-01T00:00:00Z' });

		await expect(cancelOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be cancelled');
	});

	it('rejects cancelling an already cancelled onboarding', async () => {
		const ctx = buildTransitionContext(cancelledSaved);
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		await expect(cancelOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be cancelled');
	});

	it('emits audit log', async () => {
		const ctx = buildTransitionContext(cancelledSaved);
		seedOnboarding(ctx);

		await cancelOnboarding(ctx, 'ob-1');

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'onboarding.cancelled',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1'
		});
	});
});

describe('reopenOnboarding', () => {
	it('adopts saved in_progress status with both terminal dates cleared', async () => {
		const ctx = buildTransitionContext(reopenedSaved);
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		const result = await reopenOnboarding(ctx, 'ob-1');

		expect(result.status).toBe('in_progress');
		expect(result.cancelledAt).toBeNull();
		expect(result.completedAt).toBeNull();
	});

	it('rejects reopening an in_progress onboarding', async () => {
		const ctx = buildTransitionContext(reopenedSaved);
		seedOnboarding(ctx); // status: in_progress

		await expect(reopenOnboarding(ctx, 'ob-1')).rejects.toThrow('Only cancelled onboardings can be reopened');
	});

	it('rejects reopening a completed onboarding', async () => {
		const ctx = buildTransitionContext(reopenedSaved);
		seedOnboarding(ctx, { status: 'completed', completed_at: '2026-03-01T00:00:00Z' });

		await expect(reopenOnboarding(ctx, 'ob-1')).rejects.toThrow('Only cancelled onboardings can be reopened');
	});

	it('emits audit log', async () => {
		const ctx = buildTransitionContext(reopenedSaved);
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		await reopenOnboarding(ctx, 'ob-1');

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'onboarding.reopened',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1'
		});
	});
});

function seedSteps(ctx: ReturnType<typeof buildContext>, overrides?: Record<string, unknown>[]) {
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
		const ctx = buildTransitionContext(completedSaved);
		seedOnboarding(ctx);
		seedSteps(ctx); // 2 incomplete (step-1, step-3), 1 complete (step-2)

		const result = await completeOnboarding(ctx, 'ob-1');

		expect(result.status).toBe('completed');
		expect(result.completedAt).toBeTruthy();
		expect(result.completedAt).toBe('2026-10-01');
		expect(result.cancelledAt).toBeNull();
		expect(result.incompleteCount).toBe(2);
	});

	it('returns 0 incomplete count when all active steps are complete', async () => {
		const ctx = buildTransitionContext(completedSaved);
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
		const ctx = buildTransitionContext(completedSaved);
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
		const ctx = buildTransitionContext(completedSaved);
		seedOnboarding(ctx, { status: 'cancelled', cancelled_at: '2026-03-01T00:00:00Z' });

		await expect(completeOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be completed');
	});

	it('rejects completing an already completed onboarding', async () => {
		const ctx = buildTransitionContext(completedSaved);
		seedOnboarding(ctx, { status: 'completed', completed_at: '2026-03-01T00:00:00Z' });

		await expect(completeOnboarding(ctx, 'ob-1')).rejects.toThrow('Only in-progress onboardings can be completed');
	});

	it('emits audit log with incomplete count', async () => {
		const ctx = buildTransitionContext(completedSaved);
		seedOnboarding(ctx);
		seedSteps(ctx);

		await completeOnboarding(ctx, 'ob-1');

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'onboarding.completed',
			resourceType: 'personnel_onboarding',
			resourceId: 'ob-1',
			details: { incomplete_count: 2 }
		});
	});
});

const transitions = [
	{ kind: 'cancel', run: cancelOnboarding, initialStatus: 'in_progress' },
	{ kind: 'complete', run: completeOnboarding, initialStatus: 'in_progress' },
	{ kind: 'reopen', run: reopenOnboarding, initialStatus: 'cancelled' }
] as const;

describe.each(transitions)('$kind lifecycle persistence boundary', ({ kind, run, initialStatus }) => {
	it('rejects a lost status expectation with 409 and no success audit or fallback write', async () => {
		const ctx = buildTransitionContext(null);
		seedOnboarding(ctx, { status: initialStatus });
		seedSteps(ctx);

		await expect(run(ctx, 'ob-1')).rejects.toMatchObject({ status: 409 });

		expect(ctx.transition).toHaveBeenCalledWith('test-org', 'ob-1', expect.objectContaining({ kind }));
		expect(ctx.store.update).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([Object.assign(new Error('Write denied'), { status: 403 }), new Error('Database unavailable')])(
		'propagates %s without reporting a successful transition',
		async (error) => {
			const ctx = buildTransitionContext(null);
			ctx.transition.mockRejectedValue(error);
			seedOnboarding(ctx, { status: initialStatus });

			await expect(run(ctx, 'ob-1')).rejects.toBe(error);

			expect(ctx.store.update).not.toHaveBeenCalled();
			expect(ctx.audit.events).toEqual([]);
		}
	);

	it('preserves a sequential invalid-transition 400 before calling the provider', async () => {
		const ctx = buildTransitionContext(null);
		seedOnboarding(ctx, { status: 'completed' });

		await expect(run(ctx, 'ob-1')).rejects.toMatchObject({ status: 400 });

		expect(ctx.transition).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('keeps a foreign Organization packet invisible before calling the provider', async () => {
		const ctx = buildTransitionContext(null);
		seedOnboarding(ctx, { status: initialStatus, organization_id: 'other-org' });

		await expect(run(ctx, 'ob-1')).rejects.toMatchObject({ status: 404 });

		expect(ctx.transition).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it.each(['missing capability', 'out-of-scope Person'] as const)('denies %s before persistence', async (reason) => {
		const ctx = buildTransitionContext(null, {
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...operatorCapabilityMap, onboarding: reason === 'missing capability' ? 'view' : 'operate' },
				scopeSet: { kind: 'groups', groupIds: ['g-1'] }
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'p-1', group_id: reason === 'missing capability' ? 'g-1' : 'g-2', organization_id: 'test-org' }
		]);
		seedOnboarding(ctx, { status: initialStatus });

		await expect(run(ctx, 'ob-1')).rejects.toMatchObject({ status: 403 });

		expect(ctx.transition).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([expect.objectContaining({ action: 'policy.denied' })]);
	});
});

describe('unbound lifecycle provider', () => {
	it.each([createTestContext, createWritePortsContext, createWriteWithNotificationsPortsContext])(
		'fails explicitly in a test context instead of emulating a database transition',
		async (build) => {
			const ctx = build();

			await expect(
				ctx.onboardingLifecycleTransition!.transition('test-org', 'ob-1', { kind: 'reopen' })
			).rejects.toThrow('Bind the owned Onboarding lifecycle transition provider');
		}
	);

	it('rejects an absent optional provider without a generic write or success audit', async () => {
		const ctx = buildTransitionContext(null);
		const missingContext = { ...ctx, onboardingLifecycleTransition: undefined };
		seedOnboarding(ctx);

		await expect(cancelOnboarding(missingContext, 'ob-1')).rejects.toThrow(
			'Bind the owned Onboarding lifecycle transition provider'
		);

		expect(ctx.store.update).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});
});
