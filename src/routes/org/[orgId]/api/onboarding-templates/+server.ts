import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

const TEMPLATE_CLEAR_BATCH_SIZE = 25;

export const { POST, PUT, DELETE } = entityHandlers(OnboardingTemplateEntity, {
	afterDelete: async (ctx, id) => {
		await ctx.store.deleteWhere('onboarding_template_steps', ctx.auth.orgId, { template_id: id });

		const onboardings = await ctx.store.findMany<{ id: string }>('personnel_onboardings', ctx.auth.orgId, {
			template_id: id
		});

		for (let index = 0; index < onboardings.length; index += TEMPLATE_CLEAR_BATCH_SIZE) {
			const batch = onboardings.slice(index, index + TEMPLATE_CLEAR_BATCH_SIZE);
			await Promise.all(
				batch.map((onboarding) =>
					ctx.store.update('personnel_onboardings', ctx.auth.orgId, onboarding.id, { template_id: null })
				)
			);
		}
	}
});
