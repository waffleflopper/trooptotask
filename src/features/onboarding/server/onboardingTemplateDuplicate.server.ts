import { error } from '@sveltejs/kit';
import type { OnboardingTemplateWriteContext } from './onboardingTemplatePorts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../contracts';

export interface DuplicateOnboardingTemplateResult {
	template: OnboardingTemplate;
	templateSteps: OnboardingTemplateStep[];
}

export async function duplicateOnboardingTemplate(
	ctx: OnboardingTemplateWriteContext,
	templateId: string
): Promise<DuplicateOnboardingTemplateResult> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
		{ kind: 'organization' },
		'onboarding_template',
		templateId
	);

	const source = await ctx.onboardingCatalog.findTemplate(templateId);
	if (!source) throw error(404, 'Onboarding template not found');
	const existingTemplates = await ctx.onboardingCatalog.listTemplates();
	const duplicateName = getDuplicateTemplateName(
		source.name,
		existingTemplates.map((template) => template.name)
	);
	const createdTemplate = await ctx.onboardingCatalog.createTemplate({
		name: duplicateName,
		description: source.description
	});
	const sourceSteps = await ctx.onboardingCatalog.listSteps(templateId);
	const createdSteps = await ctx.onboardingCatalog.createSteps(
		sourceSteps.map((step, index) => ({
			templateId: createdTemplate.id,
			name: step.name,
			description: step.description,
			stepType: step.stepType,
			trainingTypeId: step.trainingTypeId,
			stages: step.stages ? [...step.stages] : null,
			sortOrder: index
		}))
	);

	ctx.audit.log({
		action: 'onboarding_template.duplicated',
		resourceType: 'onboarding_template',
		resourceId: createdTemplate.id,
		details: { sourceTemplateId: templateId, stepCount: createdSteps.length }
	});

	return {
		template: createdTemplate,
		templateSteps: createdSteps
	};
}

function getDuplicateTemplateName(sourceName: string, existingNames: string[]): string {
	const taken = new Set(existingNames);
	const base = `${sourceName} Copy`;
	if (!taken.has(base)) return base;

	for (let copyNumber = 2; copyNumber < 1000; copyNumber += 1) {
		const candidate = `${base} ${copyNumber}`;
		if (!taken.has(candidate)) return candidate;
	}

	return `${base} ${crypto.randomUUID().slice(0, 8)}`;
}
