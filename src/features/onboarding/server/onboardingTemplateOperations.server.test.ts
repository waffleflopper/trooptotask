import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import {
	createOnboardingTemplate,
	createOnboardingTemplateStep,
	deleteOnboardingTemplate,
	deleteOnboardingTemplateStep,
	duplicateOnboardingTemplate,
	updateOnboardingTemplate,
	reorderOnboardingTemplateSteps,
	updateOnboardingTemplateStep
} from './onboardingTemplateOperations.server';

const TMPL_ID = '00000000-0000-4000-a000-000000000001';
const REQUEST_ID = '00000000-0000-4000-a000-000000009001';

const TEMPLATE_1 = '00000000-0000-4000-8000-000000000010';
const MISSING_TEMPLATE = '00000000-0000-4000-8000-000000000011';
const FOREIGN_TEMPLATE = '00000000-0000-4000-8000-000000000012';
const MISSING_TRAINING = '00000000-0000-4000-8000-000000000013';
const FOREIGN_TRAINING = '00000000-0000-4000-8000-000000000014';
const IGNORED_TRAINING = '00000000-0000-4000-8000-000000000015';
const CPR_TRAINING = '00000000-0000-4000-8000-000000000016';
const CPR_TRAINING_TYPE = '00000000-0000-4000-8000-000000000017';
const STEP_1 = '00000000-0000-4000-8000-000000000018';
const STEP_A = '00000000-0000-4000-8000-000000000019';
const STEP_B = '00000000-0000-4000-8000-00000000001a';
const STEP_C = '00000000-0000-4000-8000-00000000001b';
const STEP_PAPERWORK = '00000000-0000-4000-8000-00000000001c';
const STEP_TRAINING = '00000000-0000-4000-8000-00000000001d';

const operateOnlyCapabilityMap: CapabilityMap = {
	calendar: 'none',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

describe('Onboarding configuration JSON shape admission', () => {
	it.each([null, [], 'not an object', 42])(
		'rejects non-object template and step commands with400 and no effects: %j',
		async (body) => {
			const ctx = configurationContext();
			for (const operation of [
				createOnboardingTemplate,
				updateOnboardingTemplate,
				createOnboardingTemplateStep,
				updateOnboardingTemplateStep
			]) {
				await expect(operation(ctx, body as never)).rejects.toMatchObject({ status: 400 });
			}
			expect(ctx.audit.events).toEqual([]);
		}
	);
});

describe('Onboarding declared JSON fields', () => {
	it.each([
		['description', 42],
		['stages', ['Filed', 42]],
		['trainingTypeId', 42]
	])('rejects an invalid %s rather than silently clearing or dropping values', async (field, value) => {
		const ctx = configurationContext();
		const before = await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId);
		const body = { id: STEP_1, templateId: TEMPLATE_1, name: 'Valid step', stepType: 'paperwork', [field]: value };
		await expect(createOnboardingTemplateStep(ctx, body)).rejects.toMatchObject({ status: 400 });
		await expect(updateOnboardingTemplateStep(ctx, body)).rejects.toMatchObject({ status: 400 });
		if (field === 'description') {
			await expect(createOnboardingTemplate(ctx, { name: 'Valid', description: value })).rejects.toMatchObject({
				status: 400
			});
			await expect(updateOnboardingTemplate(ctx, { id: TMPL_ID, description: value })).rejects.toMatchObject({
				status: 400
			});
		}
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toEqual(before);
		expect(ctx.audit.events).toEqual([]);
	});
});

describe('Onboarding Template CRUD', () => {
	it('creates a normalized template and audits', async () => {
		const ctx = configurationContext();

		const result = await createOnboardingTemplate(ctx, {
			name: '  New Soldier Checklist  ',
			description: '  Standard onboarding for new arrivals  '
		});

		expect(result).toMatchObject({
			name: 'New Soldier Checklist',
			description: 'Standard onboarding for new arrivals'
		});
		expect(ctx.audit.events[0].action).toBe('onboarding_template.created');
	});
});

describe('Onboarding Template Step CRUD', () => {
	it('creates a checkbox step and audits', async () => {
		const ctx = configurationContext();

		const result = await createOnboardingTemplateStep(ctx, {
			templateId: TEMPLATE_1,
			name: '  Has military email  ',
			stepType: 'checkbox',
			trainingTypeId: IGNORED_TRAINING,
			stages: ['ignored stage'],
			sortOrder: 0
		});

		expect(result).toMatchObject({
			name: 'Has military email',
			stepType: 'checkbox',
			templateId: TEMPLATE_1,
			trainingTypeId: null,
			stages: null
		});
		expect(ctx.audit.events[0].action).toBe('onboarding_template_step.created');
	});

	it('creates a paperwork step with normalized stages', async () => {
		const ctx = configurationContext();

		const result = await createOnboardingTemplateStep(ctx, {
			templateId: TEMPLATE_1,
			name: 'CAC Card Request',
			stepType: 'paperwork',
			trainingTypeId: IGNORED_TRAINING,
			stages: [' with soldier ', '', 'received by manager', ' submitted ', 'access granted'],
			sortOrder: 1
		});

		expect(result).toMatchObject({
			name: 'CAC Card Request',
			trainingTypeId: null,
			stages: ['with soldier', 'received by manager', 'submitted', 'access granted']
		});
	});

	it('creates a training step with trainingTypeId', async () => {
		const ctx = configurationContext();

		const result = await createOnboardingTemplateStep(ctx, {
			templateId: TEMPLATE_1,
			name: 'CPR Certification',
			stepType: 'training',
			trainingTypeId: ` ${CPR_TRAINING_TYPE} `,
			stages: ['ignored stage'],
			sortOrder: 2
		});

		expect(result).toMatchObject({
			name: 'CPR Certification',
			trainingTypeId: CPR_TRAINING_TYPE,
			stages: null
		});
	});

	it('rejects training steps without a Training Type', async () => {
		const ctx = configurationContext();

		await expect(
			createOnboardingTemplateStep(ctx, {
				templateId: TEMPLATE_1,
				name: 'CPR Certification',
				stepType: 'training',
				trainingTypeId: null,
				sortOrder: 2
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('updates step shape through the lifecycle interface without requiring unrelated fields', async () => {
		const ctx = configurationContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: STEP_1,
				template_id: TEMPLATE_1,
				name: 'Access Packet',
				description: null,
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['draft'],
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);

		const result = await updateOnboardingTemplateStep(ctx, {
			id: STEP_1,
			description: '  Bring completed packet  '
		});

		expect(result).toMatchObject({
			name: 'Access Packet',
			description: 'Bring completed packet',
			stepType: 'paperwork',
			stages: ['draft']
		});
	});
});

describe('Onboarding Template Step ordering', () => {
	it('reorders every step in a template as contiguous sort orders', async () => {
		const ctx = configurationContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: STEP_A,
				template_id: TMPL_ID,
				name: 'A',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: STEP_B,
				template_id: TMPL_ID,
				name: 'B',
				step_type: 'checkbox',
				sort_order: 1,
				organization_id: 'test-org'
			},
			{
				id: STEP_C,
				template_id: TMPL_ID,
				name: 'C',
				step_type: 'checkbox',
				sort_order: 2,
				organization_id: 'test-org'
			}
		]);

		const result = await reorderOnboardingTemplateSteps(ctx, {
			templateId: TMPL_ID,
			orderedStepIds: [STEP_C, STEP_A, STEP_B]
		});

		expect(result.map((step) => ({ id: step.id, sortOrder: step.sortOrder }))).toEqual([
			{ id: STEP_C, sortOrder: 0 },
			{ id: STEP_A, sortOrder: 1 },
			{ id: STEP_B, sortOrder: 2 }
		]);
		expect(ctx.audit.events.at(-1)).toMatchObject({
			action: 'onboarding_template_step.reordered',
			resourceType: 'onboarding_template_step',
			resourceId: TMPL_ID
		});
	});

	it('rejects stale step ordering that omits a template step', async () => {
		const ctx = configurationContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: STEP_A,
				template_id: TMPL_ID,
				name: 'A',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: STEP_B,
				template_id: TMPL_ID,
				name: 'B',
				step_type: 'checkbox',
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);

		await expect(
			reorderOnboardingTemplateSteps(ctx, {
				templateId: TMPL_ID,
				orderedStepIds: [STEP_B]
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('rejects duplicate step IDs before applying sort updates', async () => {
		const ctx = configurationContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: STEP_A,
				template_id: TMPL_ID,
				name: 'A',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: STEP_B,
				template_id: TMPL_ID,
				name: 'B',
				step_type: 'checkbox',
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);

		await expect(
			reorderOnboardingTemplateSteps(ctx, {
				templateId: TMPL_ID,
				orderedStepIds: [STEP_A, STEP_A]
			})
		).rejects.toMatchObject({ status: 409 });

		const rows = await ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', 'test-org', {});
		expect(rows.map((row) => ({ id: row.id, sort_order: row.sort_order }))).toEqual([
			{ id: STEP_A, sort_order: 0 },
			{ id: STEP_B, sort_order: 1 }
		]);
	});

	it.each([{ groupIds: ['group-alpha'] }, { groupIds: [] }])(
		'rejects scoped configuration reordering for groups %j without changing order',
		async ({ groupIds }) => {
			const ctx = createWritePortsContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: { ...operateOnlyCapabilityMap, onboarding: 'configure' },
					scopeSet: { kind: 'groups', groupIds }
				}
			});
			ctx.store.seed('onboarding_template_steps', [
				{ id: STEP_A, template_id: TMPL_ID, sort_order: 0, organization_id: 'test-org' }
			]);
			await expect(
				reorderOnboardingTemplateSteps(ctx, { templateId: TMPL_ID, orderedStepIds: [STEP_A] })
			).rejects.toMatchObject({ status: 403 });
			expect(await ctx.store.findOne('onboarding_template_steps', 'test-org', { id: STEP_A })).toMatchObject({
				sort_order: 0
			});
		}
	);
});

describe('Onboarding Template deletion', () => {
	it('deletes the template once and treats a repeated delete as already done', async () => {
		const ctx = configurationContext();

		await deleteOnboardingTemplate(ctx, TMPL_ID);
		await deleteOnboardingTemplate(ctx, TMPL_ID);

		expect((await ctx.onboardingCatalog.listTemplates()).map((template) => template.id)).toEqual([TEMPLATE_1]);
		expect(ctx.audit.events).toEqual([
			{ action: 'onboarding_template.deleted', resourceType: 'onboarding_template', resourceId: TMPL_ID }
		]);
	});

	it('rejects template CRUD without Onboarding configure policy', async () => {
		const ctx = createWritePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: operateOnlyCapabilityMap
			}
		});

		await expect(createOnboardingTemplate(ctx, { name: 'Blocked' })).rejects.toMatchObject({ status: 403 });
	});
});

describe('Onboarding Template duplication', () => {
	it('creates a distinct template and copies steps without mutating the source', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_templates', [
			{
				id: TMPL_ID,
				name: 'Standard Arrival',
				description: 'Default packet',
				organization_id: 'test-org',
				created_at: '2026-01-01T00:00:00.000Z'
			}
		]);
		ctx.store.seed('onboarding_template_steps', [
			{
				id: STEP_TRAINING,
				template_id: TMPL_ID,
				name: 'CPR Certification',
				description: 'Bring current card',
				step_type: 'training',
				training_type_id: CPR_TRAINING,
				stages: null,
				sort_order: 1,
				organization_id: 'test-org'
			},
			{
				id: STEP_PAPERWORK,
				template_id: TMPL_ID,
				name: 'Access Packet',
				description: 'Submit account paperwork',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['with soldier', 'submitted', 'access granted'],
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);

		const result = await duplicateOnboardingTemplate(ctx, { templateId: TMPL_ID, requestId: REQUEST_ID });

		expect(result.template).toMatchObject({
			name: 'Standard Arrival Copy',
			description: 'Default packet'
		});
		expect(result.template.id).not.toBe(TMPL_ID);
		expect(result.templateSteps).toEqual([
			expect.objectContaining({
				templateId: result.template.id,
				name: 'Access Packet',
				description: 'Submit account paperwork',
				stepType: 'paperwork',
				trainingTypeId: null,
				stages: ['with soldier', 'submitted', 'access granted'],
				sortOrder: 0
			}),
			expect.objectContaining({
				templateId: result.template.id,
				name: 'CPR Certification',
				description: 'Bring current card',
				stepType: 'training',
				trainingTypeId: CPR_TRAINING,
				stages: null,
				sortOrder: 1
			})
		]);

		const sourceSteps = await ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', 'test-org', {
			template_id: TMPL_ID
		});
		expect(sourceSteps).toHaveLength(2);
		expect(sourceSteps.map((step) => step.id).sort()).toEqual([STEP_PAPERWORK, STEP_TRAINING]);
		expect(ctx.audit.events.at(-1)).toMatchObject({
			action: 'onboarding_template.duplicated',
			resourceType: 'onboarding_template',
			resourceId: result.template.id,
			details: { sourceTemplateId: TMPL_ID, stepCount: 2 }
		});
	});

	it('answers a repeated request with the first copy and audits it once', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_templates', [{ id: TMPL_ID, name: 'Standard Arrival', organization_id: 'test-org' }]);

		const first = await duplicateOnboardingTemplate(ctx, { templateId: TMPL_ID, requestId: REQUEST_ID });
		const replay = await duplicateOnboardingTemplate(ctx, { templateId: TMPL_ID, requestId: REQUEST_ID });

		expect(replay).toEqual(first);
		expect((await ctx.onboardingCatalog.listTemplates()).map((template) => template.name)).toEqual([
			'Standard Arrival',
			'Standard Arrival Copy'
		]);
		expect(ctx.audit.events.map((event) => event.action)).toEqual(['onboarding_template.duplicated']);
	});

	it('reports a repeated request whose copy was deleted without making another', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_templates', [{ id: TMPL_ID, name: 'Standard Arrival', organization_id: 'test-org' }]);
		const first = await duplicateOnboardingTemplate(ctx, { templateId: TMPL_ID, requestId: REQUEST_ID });
		await deleteOnboardingTemplate(ctx, first.template.id);

		await expect(
			duplicateOnboardingTemplate(ctx, { templateId: TMPL_ID, requestId: REQUEST_ID })
		).rejects.toMatchObject({ status: 409 });
		expect((await ctx.onboardingCatalog.listTemplates()).map((template) => template.name)).toEqual([
			'Standard Arrival'
		]);
	});
});

function configurationContext() {
	const ctx = createWritePortsContext();
	ctx.store.seed('onboarding_templates', [
		{ id: TEMPLATE_1, name: 'Working template', organization_id: 'test-org' },
		{ id: TMPL_ID, name: 'Ordered template', organization_id: 'test-org' }
	]);
	ctx.store.seed('training_types', [{ id: CPR_TRAINING_TYPE, name: 'CPR', organization_id: 'test-org' }]);
	return ctx;
}

describe('Onboarding configuration admission', () => {
	const writes = [
		[
			'create template',
			(ctx: ReturnType<typeof createWritePortsContext>) => createOnboardingTemplate(ctx, { name: 'Denied' })
		],
		[
			'update template',
			(ctx: ReturnType<typeof createWritePortsContext>) =>
				updateOnboardingTemplate(ctx, { id: TMPL_ID, name: 'Denied' })
		],
		['delete template', (ctx: ReturnType<typeof createWritePortsContext>) => deleteOnboardingTemplate(ctx, TMPL_ID)],
		[
			'create step',
			(ctx: ReturnType<typeof createWritePortsContext>) =>
				createOnboardingTemplateStep(ctx, { templateId: TMPL_ID, name: 'Denied', stepType: 'checkbox' })
		],
		[
			'update step',
			(ctx: ReturnType<typeof createWritePortsContext>) =>
				updateOnboardingTemplateStep(ctx, { id: STEP_1, name: 'Denied' })
		],
		['delete step', (ctx: ReturnType<typeof createWritePortsContext>) => deleteOnboardingTemplateStep(ctx, STEP_1)],
		[
			'duplicate template',
			(ctx: ReturnType<typeof createWritePortsContext>) =>
				duplicateOnboardingTemplate(ctx, { templateId: TMPL_ID, requestId: REQUEST_ID })
		]
	] as const;
	it.each(writes)(
		'rejects %s for Group-scoped configurators and leaves configuration untouched',
		async (_name, write) => {
			const ctx = createWritePortsContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: { ...operateOnlyCapabilityMap, onboarding: 'configure' },
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			});
			ctx.store.seed('onboarding_templates', [{ id: TMPL_ID, name: 'Original', organization_id: 'test-org' }]);
			ctx.store.seed('onboarding_template_steps', [
				{
					id: STEP_1,
					template_id: TMPL_ID,
					name: 'Original step',
					step_type: 'checkbox',
					organization_id: 'test-org'
				}
			]);
			await expect(write(ctx)).rejects.toMatchObject({ status: 403 });
			expect(await ctx.store.findMany('onboarding_templates', 'test-org')).toMatchObject([
				{ id: TMPL_ID, name: 'Original' }
			]);
			expect(await ctx.store.findMany('onboarding_template_steps', 'test-org')).toMatchObject([
				{ id: STEP_1, name: 'Original step' }
			]);
		}
	);
	it.each([
		['missing-template', MISSING_TEMPLATE],
		['foreign-template', FOREIGN_TEMPLATE]
	])('rejects creation referencing %s before writing a step', async (_label, templateId) => {
		const ctx = configurationContext();
		ctx.store.seed('onboarding_templates', [{ id: FOREIGN_TEMPLATE, name: 'Private', organization_id: 'foreign-org' }]);
		await expect(
			createOnboardingTemplateStep(ctx, { templateId, name: 'Blocked', stepType: 'checkbox' })
		).rejects.toMatchObject({ status: 404 });
		expect(await ctx.store.findMany('onboarding_template_steps', 'test-org')).toEqual([]);
	});
	it.each([
		['missing-training', MISSING_TRAINING],
		['foreign-training', FOREIGN_TRAINING]
	])(
		'rejects Training reference %s for creation and update without changing saved steps',
		async (_label, trainingTypeId) => {
			const ctx = configurationContext();
			ctx.store.seed('training_types', [{ id: FOREIGN_TRAINING, name: 'Private', organization_id: 'foreign-org' }]);
			const step = await createOnboardingTemplateStep(ctx, {
				templateId: TEMPLATE_1,
				name: 'Original',
				stepType: 'checkbox'
			});
			const before = await ctx.store.findMany('onboarding_template_steps', 'test-org');
			await expect(
				createOnboardingTemplateStep(ctx, {
					templateId: TEMPLATE_1,
					name: 'Blocked',
					stepType: 'training',
					trainingTypeId
				})
			).rejects.toMatchObject({ status: 400 });
			await expect(
				updateOnboardingTemplateStep(ctx, { id: step.id, stepType: 'training', trainingTypeId })
			).rejects.toMatchObject({ status: 400 });
			expect(await ctx.store.findMany('onboarding_template_steps', 'test-org')).toEqual(before);
		}
	);
	it('normalizes a partial reference edit using the saved step type', async () => {
		const ctx = configurationContext();
		const checkbox = await createOnboardingTemplateStep(ctx, {
			templateId: TEMPLATE_1,
			name: 'Checkbox',
			stepType: 'checkbox'
		});
		await expect(
			updateOnboardingTemplateStep(ctx, { id: checkbox.id, trainingTypeId: FOREIGN_TRAINING, stages: ['Unused'] })
		).resolves.toMatchObject({ stepType: 'checkbox', trainingTypeId: null, stages: null });
		const training = await createOnboardingTemplateStep(ctx, {
			templateId: TEMPLATE_1,
			name: 'Training',
			stepType: 'training',
			trainingTypeId: CPR_TRAINING_TYPE
		});
		await expect(
			updateOnboardingTemplateStep(ctx, { id: training.id, trainingTypeId: FOREIGN_TRAINING })
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findOne('onboarding_template_steps', 'test-org', { id: training.id })).toMatchObject({
			training_type_id: CPR_TRAINING_TYPE
		});
	});
	it('rejects reparenting a step to a foreign template without changing it', async () => {
		const ctx = configurationContext();
		const step = await createOnboardingTemplateStep(ctx, {
			templateId: TEMPLATE_1,
			name: 'Original',
			stepType: 'checkbox'
		});
		ctx.store.seed('onboarding_templates', [{ id: FOREIGN_TEMPLATE, name: 'Private', organization_id: 'foreign-org' }]);
		await expect(
			updateOnboardingTemplateStep(ctx, { id: step.id, templateId: FOREIGN_TEMPLATE })
		).rejects.toMatchObject({ status: 404 });
		expect(await ctx.store.findOne('onboarding_template_steps', 'test-org', { id: step.id })).toMatchObject({
			template_id: TEMPLATE_1
		});
	});
	it('rejects empty reorder for a missing template', async () => {
		const ctx = configurationContext();
		await expect(
			reorderOnboardingTemplateSteps(ctx, { templateId: MISSING_TEMPLATE, orderedStepIds: [] })
		).rejects.toMatchObject({ status: 404 });
	});
});
