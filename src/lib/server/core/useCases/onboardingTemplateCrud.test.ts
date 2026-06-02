import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import {
	createOnboardingTemplate,
	createOnboardingTemplateStep,
	deleteOnboardingTemplate,
	reorderOnboardingTemplateSteps,
	updateOnboardingTemplateStep
} from './onboardingTemplateCrud';
import { duplicateOnboardingTemplate } from './onboardingTemplateDuplicate';

const TMPL_ID = '00000000-0000-4000-a000-000000000001';

const operateOnlyCapabilityMap: CapabilityMap = {
	calendar: 'none',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

describe('Onboarding Template CRUD', () => {
	it('creates a normalized template and audits', async () => {
		const ctx = createWritePortsContext();

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
		const ctx = createWritePortsContext();

		const result = await createOnboardingTemplateStep(ctx, {
			templateId: 'tmpl-1',
			name: '  Has military email  ',
			stepType: 'checkbox',
			trainingTypeId: 'ignored-training',
			stages: ['ignored stage'],
			sortOrder: 0
		});

		expect(result).toMatchObject({
			name: 'Has military email',
			stepType: 'checkbox',
			templateId: 'tmpl-1',
			trainingTypeId: null,
			stages: null
		});
		expect(ctx.audit.events[0].action).toBe('onboarding_template_step.created');
	});

	it('creates a paperwork step with normalized stages', async () => {
		const ctx = createWritePortsContext();

		const result = await createOnboardingTemplateStep(ctx, {
			templateId: 'tmpl-1',
			name: 'CAC Card Request',
			stepType: 'paperwork',
			trainingTypeId: 'ignored-training',
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
		const ctx = createWritePortsContext();

		const result = await createOnboardingTemplateStep(ctx, {
			templateId: 'tmpl-1',
			name: 'CPR Certification',
			stepType: 'training',
			trainingTypeId: ' tt-cpr ',
			stages: ['ignored stage'],
			sortOrder: 2
		});

		expect(result).toMatchObject({
			name: 'CPR Certification',
			trainingTypeId: 'tt-cpr',
			stages: null
		});
	});

	it('rejects training steps without a Training Type', async () => {
		const ctx = createWritePortsContext();

		await expect(
			createOnboardingTemplateStep(ctx, {
				templateId: 'tmpl-1',
				name: 'CPR Certification',
				stepType: 'training',
				trainingTypeId: null,
				sortOrder: 2
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('updates step shape through the lifecycle interface without requiring unrelated fields', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-1',
				template_id: 'tmpl-1',
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
			id: 'step-1',
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
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-a',
				template_id: TMPL_ID,
				name: 'A',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: 'step-b',
				template_id: TMPL_ID,
				name: 'B',
				step_type: 'checkbox',
				sort_order: 1,
				organization_id: 'test-org'
			},
			{
				id: 'step-c',
				template_id: TMPL_ID,
				name: 'C',
				step_type: 'checkbox',
				sort_order: 2,
				organization_id: 'test-org'
			}
		]);

		const result = await reorderOnboardingTemplateSteps(ctx, {
			templateId: TMPL_ID,
			orderedStepIds: ['step-c', 'step-a', 'step-b']
		});

		expect(result.map((step) => ({ id: step.id, sortOrder: step.sortOrder }))).toEqual([
			{ id: 'step-c', sortOrder: 0 },
			{ id: 'step-a', sortOrder: 1 },
			{ id: 'step-b', sortOrder: 2 }
		]);
		expect(ctx.audit.events.at(-1)).toMatchObject({
			action: 'onboarding_template_step.reordered',
			resourceType: 'onboarding_template_step',
			resourceId: TMPL_ID
		});
	});

	it('rejects stale step ordering that omits a template step', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-a',
				template_id: TMPL_ID,
				name: 'A',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: 'step-b',
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
				orderedStepIds: ['step-b']
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('rejects duplicate step IDs before applying sort updates', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-a',
				template_id: TMPL_ID,
				name: 'A',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: 'step-b',
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
				orderedStepIds: ['step-a', 'step-a']
			})
		).rejects.toMatchObject({ status: 409 });

		const rows = await ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', 'test-org', {});
		expect(rows.map((row) => ({ id: row.id, sort_order: row.sort_order }))).toEqual([
			{ id: 'step-a', sort_order: 0 },
			{ id: 'step-b', sort_order: 1 }
		]);
	});

	it('allows scoped onboarding configurators to reorder unscoped workflow steps', async () => {
		const ctx = createWritePortsContext({
			auth: {
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'configure',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-a',
				template_id: TMPL_ID,
				name: 'A',
				step_type: 'checkbox',
				sort_order: 0,
				organization_id: 'test-org'
			},
			{
				id: 'step-b',
				template_id: TMPL_ID,
				name: 'B',
				step_type: 'checkbox',
				sort_order: 1,
				organization_id: 'test-org'
			}
		]);

		const result = await reorderOnboardingTemplateSteps(ctx, {
			templateId: TMPL_ID,
			orderedStepIds: ['step-b', 'step-a']
		});

		expect(result.map((step) => step.id)).toEqual(['step-b', 'step-a']);
	});
});

describe('Onboarding Template deletion hooks', () => {
	it('cascade-deletes template steps when template is deleted', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_templates', [{ id: TMPL_ID, name: 'Checklist A', organization_id: 'test-org' }]);
		ctx.store.seed('onboarding_template_steps', [
			{ id: 'ts-1', template_id: TMPL_ID, name: 'Step A', organization_id: 'test-org' },
			{ id: 'ts-2', template_id: TMPL_ID, name: 'Step B', organization_id: 'test-org' },
			{ id: 'ts-other', template_id: 'tmpl-other', name: 'Unrelated', organization_id: 'test-org' }
		]);

		await deleteOnboardingTemplate(ctx, TMPL_ID);

		const remaining = await ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', 'test-org', {});
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe('ts-other');
	});

	it('nulls template_id on referencing onboardings when template is deleted', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_templates', [{ id: TMPL_ID, name: 'Checklist A', organization_id: 'test-org' }]);
		ctx.store.seed('personnel_onboardings', [
			{ id: 'ob-1', template_id: TMPL_ID, personnel_id: 'p-1', status: 'in_progress', organization_id: 'test-org' },
			{ id: 'ob-2', template_id: TMPL_ID, personnel_id: 'p-2', status: 'completed', organization_id: 'test-org' },
			{ id: 'ob-3', template_id: 'tmpl-other', personnel_id: 'p-3', status: 'in_progress', organization_id: 'test-org' }
		]);

		await deleteOnboardingTemplate(ctx, TMPL_ID);

		const ob1 = await ctx.store.findOne<Record<string, unknown>>('personnel_onboardings', 'test-org', { id: 'ob-1' });
		const ob2 = await ctx.store.findOne<Record<string, unknown>>('personnel_onboardings', 'test-org', { id: 'ob-2' });
		const ob3 = await ctx.store.findOne<Record<string, unknown>>('personnel_onboardings', 'test-org', { id: 'ob-3' });

		expect(ob1!.template_id).toBeNull();
		expect(ob2!.template_id).toBeNull();
		expect(ob3!.template_id).toBe('tmpl-other');
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

	it('blocks mutations in read-only mode', async () => {
		const ctx = createWritePortsContext({ readOnly: true });

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
				id: 'step-training',
				template_id: TMPL_ID,
				name: 'CPR Certification',
				description: 'Bring current card',
				step_type: 'training',
				training_type_id: 'training-cpr',
				stages: null,
				sort_order: 1,
				organization_id: 'test-org'
			},
			{
				id: 'step-paperwork',
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

		const result = await duplicateOnboardingTemplate(ctx, TMPL_ID);

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
				trainingTypeId: 'training-cpr',
				stages: null,
				sortOrder: 1
			})
		]);

		const sourceSteps = await ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', 'test-org', {
			template_id: TMPL_ID
		});
		expect(sourceSteps).toHaveLength(2);
		expect(sourceSteps.map((step) => step.id).sort()).toEqual(['step-paperwork', 'step-training']);
		expect(ctx.audit.events.at(-1)).toMatchObject({
			action: 'onboarding_template.duplicated',
			resourceType: 'onboarding_template',
			resourceId: result.template.id,
			details: { sourceTemplateId: TMPL_ID, stepCount: 2 }
		});
	});

	it('increments the duplicate name when copy names already exist', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('onboarding_templates', [
			{ id: TMPL_ID, name: 'Standard Arrival', organization_id: 'test-org' },
			{ id: 'copy-1', name: 'Standard Arrival Copy', organization_id: 'test-org' },
			{ id: 'copy-2', name: 'Standard Arrival Copy 2', organization_id: 'test-org' }
		]);

		const result = await duplicateOnboardingTemplate(ctx, TMPL_ID);

		expect(result.template.name).toBe('Standard Arrival Copy 3');
	});
});
