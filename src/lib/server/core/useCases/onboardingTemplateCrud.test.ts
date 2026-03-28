import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { createCrudUseCases } from './crud';

const TMPL_ID = '00000000-0000-4000-a000-000000000001';

// Same config entityHandlers() derives for template — with afterDelete hook
const templateUseCases = createCrudUseCases({
	entity: OnboardingTemplateEntity,
	permission: OnboardingTemplateEntity.permission!,
	auditResource: (OnboardingTemplateEntity.audit as { resourceType: string }).resourceType,
	requireFullEditor: OnboardingTemplateEntity.requireFullEditor,
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
	auditResource: (OnboardingTemplateStepEntity.audit as { resourceType: string }).resourceType,
	requireFullEditor: OnboardingTemplateStepEntity.requireFullEditor
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

	it('rejects non-full-editor from template CRUD', async () => {
		const ctx = createWritePortsContext({
			auth: {
				isFullEditor: false,
				role: 'member',
				isPrivileged: false,
				requireFullEditor: () => {
					throw { status: 403 };
				}
			}
		});

		await expect(templateUseCases.create(ctx, { name: 'Blocked' })).rejects.toMatchObject({ status: 403 });
	});

	it('blocks mutations in read-only mode', async () => {
		const ctx = createWritePortsContext({ readOnly: true });

		await expect(templateUseCases.create(ctx, { name: 'Blocked' })).rejects.toMatchObject({ status: 403 });
	});
});
