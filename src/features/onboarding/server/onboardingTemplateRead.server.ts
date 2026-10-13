import type {
	OnboardingTemplateActivityContext,
	OnboardingTemplateReadContext
} from './onboardingTemplatePorts.server';

export async function fetchOnboardingTemplatesData(ctx: OnboardingTemplateReadContext) {
	const [templates, templateSteps] = await Promise.all([
		ctx.onboardingCatalog.listTemplates(),
		ctx.onboardingCatalog.listSteps()
	]);
	return { templates, templateSteps };
}

/** In-progress packets on each template, among the packets the requester can see (RLS applies to the count). */
export async function fetchOnboardingTemplateActivity(ctx: OnboardingTemplateActivityContext) {
	const templates = await ctx.onboardingCatalog.listTemplates();
	return ctx.onboardingWorkflow.countActivePacketsByTemplate(templates.map((template) => template.id));
}
