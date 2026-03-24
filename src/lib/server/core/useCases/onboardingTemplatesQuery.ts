import type { UseCaseContext } from '../ports';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';

export async function fetchOnboardingTemplatesData(ctx: UseCaseContext) {
	const orgId = ctx.auth.orgId;

	const [rawTemplates, rawSteps] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>(OnboardingTemplateEntity.table, orgId, {}),
		ctx.store.findMany<Record<string, unknown>>(OnboardingTemplateStepEntity.table, orgId, {})
	]);

	return {
		templates: OnboardingTemplateEntity.fromDbArray(rawTemplates),
		templateSteps: OnboardingTemplateStepEntity.fromDbArray(rawSteps)
	};
}
