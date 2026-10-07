import type { OnboardingTemplateReadContext } from './onboardingTemplatePorts.server';

export async function fetchOnboardingTemplatesData(ctx: OnboardingTemplateReadContext) {
	const [templates, templateSteps] = await Promise.all([
		ctx.onboardingCatalog.listTemplates(),
		ctx.onboardingCatalog.listSteps()
	]);
	return { templates, templateSteps };
}
