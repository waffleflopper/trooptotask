import type { OnboardingTemplateReadStore } from './onboardingTemplatePorts.server';

/** Raw saved rows for separately authorized exports; the request store retains its RLS. */
export function listOnboardingTemplateExportRows(
	store: Pick<OnboardingTemplateReadStore, 'findMany'>,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('onboarding_templates', orgId);
}

export function listOnboardingTemplateStepExportRows(
	store: Pick<OnboardingTemplateReadStore, 'findMany'>,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('onboarding_template_steps', orgId);
}
