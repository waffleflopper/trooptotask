import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import type { OnboardingTemplate, OnboardingTemplateStep } from '$features/onboarding/onboarding.types';

export interface DuplicateOnboardingTemplateResult {
	template: OnboardingTemplate;
	templateSteps: OnboardingTemplateStep[];
}

export async function duplicateOnboardingTemplate(
	ctx: WritePorts,
	templateId: string
): Promise<DuplicateOnboardingTemplateResult> {
	const sourceRow = await ctx.store.findOne<Record<string, unknown>>(OnboardingTemplateEntity.table, ctx.auth.orgId, {
		id: templateId
	});

	if (!sourceRow) {
		fail(404, 'Onboarding template not found');
	}

	const source = OnboardingTemplateEntity.fromDb(sourceRow);
	const existingTemplates = await ctx.store.findMany<Record<string, unknown>>(
		OnboardingTemplateEntity.table,
		ctx.auth.orgId,
		{}
	);
	const duplicateName = getDuplicateTemplateName(
		source.name,
		existingTemplates.map((template) => String(template.name ?? ''))
	);

	const createdTemplateRow = await ctx.store.insert<Record<string, unknown>>(
		OnboardingTemplateEntity.table,
		ctx.auth.orgId,
		OnboardingTemplateEntity.toDbInsert(
			{
				name: duplicateName,
				description: source.description
			},
			ctx.auth.orgId
		)
	);
	const createdTemplate = OnboardingTemplateEntity.fromDb(createdTemplateRow);

	const sourceStepRows = await ctx.store.findMany<Record<string, unknown>>(
		OnboardingTemplateStepEntity.table,
		ctx.auth.orgId,
		{ template_id: templateId },
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	const sourceSteps = OnboardingTemplateStepEntity.fromDbArray(sourceStepRows).sort(
		(a, b) => a.sortOrder - b.sortOrder
	);

	const stepRows =
		sourceSteps.length === 0
			? []
			: await ctx.store.insertMany<Record<string, unknown>>(
					OnboardingTemplateStepEntity.table,
					ctx.auth.orgId,
					sourceSteps.map((step, index) =>
						OnboardingTemplateStepEntity.toDbInsert(
							{
								templateId: createdTemplate.id,
								name: step.name,
								description: step.description,
								stepType: step.stepType,
								trainingTypeId: step.trainingTypeId,
								stages: step.stages ? [...step.stages] : null,
								sortOrder: index
							},
							ctx.auth.orgId
						)
					)
				);
	const createdSteps = OnboardingTemplateStepEntity.fromDbArray(stepRows);

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
