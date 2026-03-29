/**
 * Onboarding templates query — fetches all templates and their steps for the org.
 *
 * Returns both collections in one call; the caller joins them by `template_id`.
 * Used by the template management page and by `onboardingLifecycle.ts` when
 * instantiating a new onboarding record from a template.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';

export async function fetchOnboardingTemplatesData(ctx: QueryPorts) {
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
