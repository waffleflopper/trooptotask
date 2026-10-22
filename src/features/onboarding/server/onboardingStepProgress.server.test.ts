import { describe, it, expect, vi } from 'vitest';
import {
	createTestContext,
	createWritePortsContext,
	createWriteWithNotificationsPortsContext
} from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { toggleCheckbox, advanceStage, addNote, removeInactiveStep } from './onboardingStepProgress.server';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

interface OnboardingStepFixture {
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
}

function seedStep(ctx: Pick<ReturnType<typeof buildContext>, 'store'>, overrides?: Partial<OnboardingStepFixture>) {
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
});

function seedPaperworkStep(ctx: ReturnType<typeof buildContext>, overrides?: Partial<OnboardingStepFixture>) {
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
		seedStep(ctx);

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

	it('emits audit log on stage advance', async () => {
		const ctx = buildContext();
		seedPaperworkStep(ctx);

		await advanceStage(ctx, { stepId: 'pw-step-1', stageName: 'submitted' });

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'onboarding_step.stage_advanced',
			resourceType: 'onboarding_step_progress',
			resourceId: 'pw-step-1',
			details: { stage_name: 'submitted', completed: false }
		});
	});
});

function seedTrainingStep(ctx: ReturnType<typeof buildContext>, overrides?: Partial<OnboardingStepFixture>) {
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

const operateCapabilityMap = {
	calendar: 'none',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
} as const;

function noteContext(options?: Parameters<typeof buildContext>[0], groupId = 'group-alpha') {
	const ctx = buildContext(options);
	seedStep(ctx, {
		active: false,
		notes: [{ text: 'Original note', timestamp: '2026-09-01T12:00:00.000Z', userId: 'original-author' }]
	});
	ctx.store.seed('personnel_onboardings', [
		{ id: 'ob-1', personnel_id: 'person-1', status: 'completed', organization_id: ctx.auth.orgId }
	]);
	ctx.store.seed('personnel', [
		{ id: 'person-1', group_id: groupId, organization_id: ctx.auth.orgId, archived_at: null }
	]);
	return ctx;
}

describe('addNote', () => {
	it('returns authoritative saved notes including another committed note without generic note reads or replacement', async () => {
		const saved = {
			id: 'step-1',
			notes: [
				{ text: 'Original note', timestamp: '2026-09-01T12:00:00.000Z', userId: 'original-author' },
				{ text: 'Another committed note', timestamp: '2026-10-01T12:00:00.001Z', userId: 'other-author' },
				{ text: 'Sent to clinic', timestamp: '2026-10-01T12:00:00.002Z', userId: 'operator' }
			]
		};
		const ctx = noteContext({
			auth: { userId: 'operator' },
			onboardingNoteAppend: {
				async append(orgId, stepId, text) {
					expect({ orgId, stepId, text }).toEqual({ orgId: 'test-org', stepId: 'step-1', text: 'Sent to clinic' });
					return saved;
				}
			}
		});
		const reference = await ctx.onboardingWorkflow.findStepReference('step-1');
		ctx.onboardingWorkflow.findStepReference = async () => reference;
		const findOne = ctx.store.findOne.bind(ctx.store);
		ctx.store.findOne = (table, orgId, filters, select) => {
			if (table === 'onboarding_step_progress') throw new Error('Generic note reads are unavailable');
			return findOne(table, orgId, filters, select);
		};
		ctx.store.update = async () => {
			throw new Error('Generic replacement writes are unavailable');
		};

		await expect(addNote(ctx, { stepId: 'step-1', text: 'Sent to clinic' })).resolves.toEqual(saved);
		expect(ctx.audit.events).toEqual([
			{
				action: 'onboarding_step.note_added',
				resourceType: 'onboarding_step_progress',
				resourceId: 'step-1',
				details: { note_author_user_id: 'operator' }
			}
		]);
	});

	it('does not emit a success audit when persistence fails', async () => {
		const failure = new Error('Database unavailable');
		const ctx = noteContext({
			onboardingNoteAppend: {
				append: async () => {
					throw failure;
				}
			}
		});

		await expect(addNote(ctx, { stepId: 'step-1', text: 'Saved text' })).rejects.toBe(failure);
		expect(ctx.audit.events).toEqual([]);
	});

	it('fails explicitly without a bound provider instead of replacing notes through the generic store', async () => {
		const ctx = noteContext();
		await expect(addNote(ctx, { stepId: 'step-1', text: 'Saved text' })).rejects.toThrow(
			'Bind the owned Onboarding note append provider'
		);
		const missingContext = { ...ctx, onboardingNoteAppend: undefined };
		await expect(addNote(missingContext, { stepId: 'step-1', text: 'Saved text' })).rejects.toThrow(
			'Bind the owned Onboarding note append provider'
		);
		expect(ctx.audit.events).toEqual([]);
	});

	it('denies a viewer before calling the atomic provider', async () => {
		const append = vi.fn(async () => ({ id: 'step-1', notes: [] }));
		const ctx = noteContext({
			onboardingNoteAppend: { append },
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...operateCapabilityMap, onboarding: 'view' }
			}
		});

		await expect(addNote(ctx, { stepId: 'step-1', text: 'Saved text' })).rejects.toMatchObject({ status: 403 });
		expect(append).not.toHaveBeenCalled();
		expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'onboarding_step.note_added' }));
	});

	it('denies an out-of-scope Person before calling the atomic provider', async () => {
		const append = vi.fn(async () => ({ id: 'step-1', notes: [] }));
		const ctx = noteContext(
			{
				onboardingNoteAppend: { append },
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: operateCapabilityMap,
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			},
			'group-bravo'
		);

		await expect(addNote(ctx, { stepId: 'step-1', text: 'Saved text' })).rejects.toMatchObject({ status: 403 });
		expect(append).not.toHaveBeenCalled();
		expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'onboarding_step.note_added' }));
	});
});

describe('removeInactiveStep', () => {
	it('rejects an unmet persistence predicate without claiming removal or erasing saved work', async () => {
		const ctx = noteContext();
		const before = await ctx.store.findOne<OnboardingStepFixture>('onboarding_step_progress', ctx.auth.orgId, {
			id: 'step-1'
		});
		const reactivated = { ...before!, active: true };
		// A controlled boundary outcome, not an in-memory conditional-delete algorithm or concurrency proof.
		ctx.onboardingInactiveStepRemoval = {
			async remove() {
				await ctx.store.update('onboarding_step_progress', ctx.auth.orgId, 'step-1', { active: true });
				return null;
			}
		};
		ctx.store.delete = async () => {
			throw new Error('Generic deletion is unavailable');
		};

		await expect(removeInactiveStep(ctx, 'step-1')).rejects.toMatchObject({ status: 409 });

		await expect(ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' })).resolves.toEqual(
			reactivated
		);
		expect(ctx.audit.events).not.toContainEqual(
			expect.objectContaining({ action: 'onboarding_step.inactive_removed' })
		);
	});

	it('uses a successful owned removal and audits its identity for terminal, completed inactive work', async () => {
		const remove = vi.fn(async () => ({ id: 'step-1' }));
		const ctx = noteContext({ onboardingInactiveStepRemoval: { remove } });
		await ctx.store.update('onboarding_step_progress', ctx.auth.orgId, 'step-1', { completed: true });
		ctx.store.delete = async () => {
			throw new Error('Generic deletion is unavailable');
		};

		await removeInactiveStep(ctx, 'step-1');

		expect(remove).toHaveBeenCalledWith('test-org', 'step-1');
		expect(ctx.audit.events).toContainEqual({
			action: 'onboarding_step.inactive_removed',
			resourceType: 'onboarding_step_progress',
			resourceId: 'step-1'
		});
	});

	it('rejects removal of an active step', async () => {
		const remove = vi.fn(async () => ({ id: 'step-1' }));
		const ctx = buildContext({ onboardingInactiveStepRemoval: { remove } });
		seedStep(ctx, { active: true });

		await expect(removeInactiveStep(ctx, 'step-1')).rejects.toMatchObject({ status: 400 });
		expect(remove).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects when step not found', async () => {
		const remove = vi.fn(async () => ({ id: 'nonexistent' }));
		const ctx = buildContext({ onboardingInactiveStepRemoval: { remove } });

		await expect(removeInactiveStep(ctx, 'nonexistent')).rejects.toMatchObject({ status: 404 });
		expect(remove).not.toHaveBeenCalled();
	});

	it('propagates a provider failure with saved work retained and no success audit', async () => {
		const failure = new Error('Delete rejected by provider');
		const ctx = noteContext({
			onboardingInactiveStepRemoval: {
				async remove() {
					throw failure;
				}
			}
		});
		const before = await ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' });

		await expect(removeInactiveStep(ctx, 'step-1')).rejects.toBe(failure);

		await expect(ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' })).resolves.toEqual(
			before
		);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([createTestContext, createWritePortsContext, createWriteWithNotificationsPortsContext])(
		'fails explicitly in an unbound test context instead of deleting through the generic store',
		async (createContext) => {
			const ctx = createContext();
			seedStep(ctx, { active: false });
			await expect(removeInactiveStep(ctx, 'step-1')).rejects.toThrow(
				'Bind the owned Onboarding inactive step removal provider'
			);
			const missingContext = { ...ctx, onboardingInactiveStepRemoval: undefined };
			await expect(removeInactiveStep(missingContext, 'step-1')).rejects.toThrow(
				'Bind the owned Onboarding inactive step removal provider'
			);
			await expect(
				ctx.store.findOne('onboarding_step_progress', ctx.auth.orgId, { id: 'step-1' })
			).resolves.not.toBeNull();
		}
	);

	it.each([
		{ onboarding: 'view' as const, groupId: 'group-alpha' },
		{ onboarding: 'operate' as const, groupId: 'group-bravo' }
	])('denies $onboarding/$groupId before persistence', async ({ onboarding, groupId }) => {
		const remove = vi.fn(async () => ({ id: 'step-1' }));
		const ctx = noteContext(
			{
				onboardingInactiveStepRemoval: { remove },
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: { ...operateCapabilityMap, onboarding },
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			},
			groupId
		);

		await expect(removeInactiveStep(ctx, 'step-1')).rejects.toMatchObject({ status: 403 });
		expect(remove).not.toHaveBeenCalled();
		expect(ctx.audit.events).not.toContainEqual(
			expect.objectContaining({ action: 'onboarding_step.inactive_removed' })
		);
	});
});
