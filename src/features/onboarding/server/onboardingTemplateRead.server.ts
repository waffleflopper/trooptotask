import type { OnboardingTemplate, OnboardingTemplateStep } from '../contracts';
import { OnboardingTemplateEntity } from './onboardingTemplateEntity.server';
import { OnboardingTemplateStepEntity } from './onboardingTemplateStepEntity.server';
import type { OnboardingTemplateReadContext, OnboardingTemplateReadStore } from './onboardingTemplatePorts.server';

type TemplateReadStore = Pick<OnboardingTemplateReadStore, 'findMany' | 'findOne'>;

/** The caller supplies its authorized Organization-scoped request store. */
export async function listOnboardingTemplates(
	store: Pick<TemplateReadStore, 'findMany'>,
	orgId: string
): Promise<OnboardingTemplate[]> {
	const rows = await store.findMany<Record<string, unknown>>(OnboardingTemplateEntity.table, orgId, undefined, {
		orderBy: [{ column: 'name', ascending: true }]
	});
	return OnboardingTemplateEntity.fromDbArray(rows);
}

export async function listOnboardingTemplateSteps(
	store: Pick<TemplateReadStore, 'findMany'>,
	orgId: string,
	templateId?: string
): Promise<OnboardingTemplateStep[]> {
	const rows = await store.findMany<Record<string, unknown>>(
		OnboardingTemplateStepEntity.table,
		orgId,
		templateId ? { template_id: templateId } : undefined,
		{ orderBy: [{ column: 'sort_order', ascending: true }] }
	);
	return OnboardingTemplateStepEntity.fromDbArray(rows);
}

export async function fetchOnboardingTemplatesData(ctx: OnboardingTemplateReadContext) {
	const [templates, templateSteps] = await Promise.all([
		listOnboardingTemplates(ctx.store, ctx.auth.orgId),
		listOnboardingTemplateSteps(ctx.store, ctx.auth.orgId)
	]);
	return { templates, templateSteps };
}

export async function findOnboardingTemplateByName(
	store: Pick<TemplateReadStore, 'findOne'>,
	orgId: string,
	name: string
): Promise<OnboardingTemplate | null> {
	const row = await store.findOne<Record<string, unknown>>(OnboardingTemplateEntity.table, orgId, { name });
	return row ? OnboardingTemplateEntity.fromDb(row) : null;
}

export async function findOnboardingTemplateStepByName(
	store: Pick<TemplateReadStore, 'findOne'>,
	orgId: string,
	templateId: string,
	name: string
): Promise<OnboardingTemplateStep | null> {
	const row = await store.findOne<Record<string, unknown>>(OnboardingTemplateStepEntity.table, orgId, {
		template_id: templateId,
		name
	});
	return row ? OnboardingTemplateStepEntity.fromDb(row) : null;
}

/** Single-row existence checks and only the requested starter step names. */
export async function fetchOnboardingStarterReadiness(
	store: TemplateReadStore,
	orgId: string,
	templateName: string,
	stepNames: string[]
) {
	const [template, templates, steps] = await Promise.all([
		findOnboardingTemplateByName(store, orgId, templateName),
		store.findMany<{ id: string }>(OnboardingTemplateEntity.table, orgId, {}, { select: 'id', limit: 1 }),
		store.findMany<{ id: string }>(OnboardingTemplateStepEntity.table, orgId, {}, { select: 'id', limit: 1 })
	]);
	const existingStarterSteps = template
		? await store.findMany<{ name: string; template_id: string }>(
				OnboardingTemplateStepEntity.table,
				orgId,
				{ template_id: template.id },
				{ inFilters: { name: stepNames }, select: 'name, template_id' }
			)
		: [];
	return {
		template,
		hasAnyTemplate: templates.length > 0,
		hasAnyStep: steps.length > 0,
		stepNames: existingStarterSteps.map((step) => step.name)
	};
}

export async function countOnboardingTemplateSteps(
	store: Pick<OnboardingTemplateReadStore, 'findManyWithCount'>,
	orgId: string
): Promise<number> {
	const result = await store.findManyWithCount<{ id: string }>(OnboardingTemplateStepEntity.table, orgId, undefined, {
		select: 'id',
		range: { from: 0, to: 0 },
		count: 'estimated'
	});
	return result.count ?? 0;
}
