import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import { createCrudUseCases } from './crud';
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

// Same config entityHandlers() derives for template — with afterDelete hook
const templateUseCases = createCrudUseCases({
	entity: OnboardingTemplateEntity,
	permission: OnboardingTemplateEntity.permission!,
	auditResource: getEntityAuditResource(OnboardingTemplateEntity),
	policyAction: OnboardingTemplateEntity.policyAction,
	afterDelete: async (ctx, id) => {
		await ctx.store.deleteWhere('onboarding_template_steps', ctx.auth.orgId, { template_id: id });

		const onboardings = await ctx.store.findMany<{ id: string }>('personnel_onboardings', ctx.auth.orgId, {
			template_id: id
		});
		for (const onboarding of onboardings) {
			await ctx.store.update('personnel_onboardings', ctx.auth.orgId, onboarding.id, { template_id: null });
		}
	}
});

// Same config entityHandlers() derives for step — no hooks
const stepUseCases = createCrudUseCases({
	entity: OnboardingTemplateStepEntity,
	permission: OnboardingTemplateStepEntity.permission!,
	auditResource: getEntityAuditResource(OnboardingTemplateStepEntity),
	policyAction: OnboardingTemplateStepEntity.policyAction
});

describe('Onboarding Template CRUD', () => {
	it('creates a template and audits', async () => {
		const ctx = createWritePortsContext();

		const result = (await templateUseCases.create(ctx, {
			name: 'New Soldier Checklist',
			description: 'Standard onboarding for new arrivals'
		})) as { name: string; description: string };

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

		const result = (await stepUseCases.create(ctx, {
			templateId: 'tmpl-1',
			name: 'Has military email',
			stepType: 'checkbox',
			sortOrder: 0
		})) as { name: string; stepType: string; templateId: string };

		expect(result).toMatchObject({
			name: 'Has military email',
			stepType: 'checkbox',
			templateId: 'tmpl-1'
		});
		expect(ctx.audit.events[0].action).toBe('onboarding_template_step.created');
	});

	it('creates a paperwork step with stages', async () => {
		const ctx = createWritePortsContext();

		const result = (await stepUseCases.create(ctx, {
			templateId: 'tmpl-1',
			name: 'CAC Card Request',
			stepType: 'paperwork',
			stages: ['with soldier', 'received by manager', 'submitted', 'access granted'],
			sortOrder: 1
		})) as { name: string; stages: string[] };

		expect(result).toMatchObject({
			name: 'CAC Card Request',
			stages: ['with soldier', 'received by manager', 'submitted', 'access granted']
		});
	});

	it('creates a training step with trainingTypeId', async () => {
		const ctx = createWritePortsContext();

		const result = (await stepUseCases.create(ctx, {
			templateId: 'tmpl-1',
			name: 'CPR Certification',
			stepType: 'training',
			trainingTypeId: 'tt-cpr',
			sortOrder: 2
		})) as { name: string; trainingTypeId: string };

		expect(result).toMatchObject({
			name: 'CPR Certification',
			trainingTypeId: 'tt-cpr'
		});
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

		await templateUseCases.remove(ctx, TMPL_ID);

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

		await templateUseCases.remove(ctx, TMPL_ID);

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

		await expect(templateUseCases.create(ctx, { name: 'Blocked' })).rejects.toMatchObject({ status: 403 });
	});

	it('blocks mutations in read-only mode', async () => {
		const ctx = createWritePortsContext({ readOnly: true });

		await expect(templateUseCases.create(ctx, { name: 'Blocked' })).rejects.toMatchObject({ status: 403 });
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
