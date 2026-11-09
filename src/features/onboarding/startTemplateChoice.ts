import type { OnboardingTemplate } from './onboarding.types';

/**
 * The template the Start Onboarding dialog selects before the operator touches it.
 * The Organization's default wins. A lone template is the only sensible choice. Otherwise the operator chooses.
 */
export function preselectedTemplateId(templates: readonly OnboardingTemplate[]): string {
	const defaultTemplate = templates.find((template) => template.isDefault);
	if (defaultTemplate) return defaultTemplate.id;
	return templates.length === 1 ? templates[0].id : '';
}
