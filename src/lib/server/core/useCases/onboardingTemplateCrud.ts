import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import type { CrudConfig } from './crud';

export const onboardingTemplateCrudConfig: CrudConfig = {
	entity: OnboardingTemplateEntity,
	permission: 'onboarding',
	auditResource: 'onboarding_template',
	requireFullEditor: true,
	afterDelete: async (ctx, id) => {
		// Null out template_id on any personnel_onboardings referencing this template
		const onboardings = await ctx.store.findMany<{ id: string }>('personnel_onboardings', ctx.auth.orgId, {
			template_id: id
		});
		for (const onboarding of onboardings) {
			await ctx.store.update('personnel_onboardings', ctx.auth.orgId, onboarding.id, { template_id: null });
		}
	}
};

export const onboardingTemplateStepCrudConfig: CrudConfig = {
	entity: OnboardingTemplateStepEntity,
	permission: 'onboarding',
	auditResource: 'onboarding_template_step',
	requireFullEditor: true
};
