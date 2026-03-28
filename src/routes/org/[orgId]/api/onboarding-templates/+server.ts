import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = entityHandlers(OnboardingTemplateEntity, {
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
