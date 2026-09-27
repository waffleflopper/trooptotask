import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$features/personnel/contracts';
import { listGroupCatalog } from '$features/personnel/index.server';
import type { Personnel } from '$lib/types';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { requireOnboardingViewPolicy, type OnboardingTrainingPorts } from './onboardingPolicy';

export interface OnboardingBootstrap {
	onboardingTemplates: OnboardingTemplate[];
	onboardingTemplateSteps: OnboardingTemplateStep[];
	onboardings: PersonnelOnboarding[];
	personnel: Personnel[];
	groups: Group[];
	trainingTypes: TrainingType[];
}

export type OnboardingBootstrapMode = 'all' | 'active' | 'history';

export interface FetchOnboardingBootstrapOptions {
	mode?: OnboardingBootstrapMode;
}

function onboardingQueryFiltersForMode(mode: OnboardingBootstrapMode): {
	filters?: Record<string, unknown>;
	inFilters?: Record<string, unknown[]>;
} {
	switch (mode) {
		case 'active':
			return { filters: { status: 'in_progress' } };
		case 'history':
			return { inFilters: { status: ['completed', 'cancelled'] } };
		case 'all':
			return {};
	}
}

function applyTrainingCompletionStatuses(
	onboarding: PersonnelOnboarding,
	completedTrainingTypeIdsByPersonnelId: Map<string, Set<string>>
): PersonnelOnboarding {
	const completedTrainingTypeIds = completedTrainingTypeIdsByPersonnelId.get(onboarding.personnelId) ?? new Set();

	return {
		...onboarding,
		steps: onboarding.steps.map((step) => {
			if (step.stepType !== 'training' || !step.active || step.trainingTypeId === null) {
				return step;
			}

			return { ...step, completed: completedTrainingTypeIds.has(step.trainingTypeId) };
		})
	};
}

function collectActiveTrainingTypeIds(onboarding: PersonnelOnboarding): string[] {
	return onboarding.steps
		.filter((step) => step.stepType === 'training' && step.active && step.trainingTypeId !== null)
		.map((step) => step.trainingTypeId as string);
}

async function readCompletedTrainingTypeIdsByPersonnelId(
	ctx: OnboardingTrainingPorts,
	trainingOnboardings: PersonnelOnboarding[]
): Promise<Map<string, Set<string>>> {
	const personnelIds = [...new Set(trainingOnboardings.map((onboarding) => onboarding.personnelId))];
	const trainingTypeIds = [
		...new Set(trainingOnboardings.flatMap((onboarding) => collectActiveTrainingTypeIds(onboarding)))
	];

	if (personnelIds.length === 0 || trainingTypeIds.length === 0) {
		return new Map();
	}

	return ctx.trainingOnboardingReferences.completedTypeIds(ctx.auth, personnelIds, trainingTypeIds);
}

export async function fetchOnboardingBootstrap(
	ctx: OnboardingTrainingPorts,
	options: FetchOnboardingBootstrapOptions = {}
): Promise<OnboardingBootstrap> {
	await requireOnboardingViewPolicy(ctx);

	const orgId = ctx.auth.orgId;
	const mode = options.mode ?? 'all';
	const onboardingQuery = onboardingQueryFiltersForMode(mode);
	const scopedAllPersonnel =
		ctx.auth.scopeSet.kind === 'groups' && mode === 'all'
			? ctx.personnelOnboardingRoster.listRoster(ctx.auth, 'all')
			: null;

	const [templateRows, templateStepRows, onboardingRows, personnel, groups, trainingTypeRows, scopePersonnel] =
		await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('onboarding_templates', orgId, undefined, {
				orderBy: [{ column: 'name', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', orgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', orgId, onboardingQuery.filters, {
				select: PersonnelOnboardingEntity.select,
				...(onboardingQuery.inFilters ? { inFilters: onboardingQuery.inFilters } : {})
			}),
			ctx.personnelOnboardingRoster.listRoster(ctx.auth, mode === 'history' ? 'all' : 'active'),
			listGroupCatalog(ctx),
			ctx.trainingOnboardingReferences.listTypes(ctx.auth),
			scopedAllPersonnel
		]);

	const templates = OnboardingTemplateEntity.fromDbArray(templateRows);
	const templateSteps = OnboardingTemplateStepEntity.fromDbArray(templateStepRows);
	const allOnboardings = PersonnelOnboardingEntity.fromDbArray(onboardingRows);
	const trainingTypes = trainingTypeRows;

	// personnel_onboardings has no group column so the scoped store cannot filter it automatically.
	// The Personnel-owned roster applies the actor's Group scope; use its IDs to
	// restrict onboardings to those members.
	let onboardings = allOnboardings;
	if (ctx.auth.scopeSet.kind === 'groups') {
		const scopedPersonnelIds = new Set((scopePersonnel ?? personnel).map((p) => p.id));
		onboardings = allOnboardings.filter((o) => scopedPersonnelIds.has(o.personnelId));
	}

	// Hydrate training-backed steps from current training records without requiring edit access.
	const activeOnboardings = onboardings.filter((o) => o.status === 'in_progress');
	const trainingOnboardings = activeOnboardings.filter((o) =>
		o.steps.some((s) => s.stepType === 'training' && s.active)
	);

	if (trainingOnboardings.length > 0) {
		const completedTrainingTypeIdsByPersonnelId = await readCompletedTrainingTypeIdsByPersonnelId(
			ctx,
			trainingOnboardings
		);
		const refreshedOnboardingById = new Map(
			trainingOnboardings.map((onboarding) => [
				onboarding.id,
				applyTrainingCompletionStatuses(onboarding, completedTrainingTypeIdsByPersonnelId)
			])
		);

		onboardings = onboardings.map((onboarding) => refreshedOnboardingById.get(onboarding.id) ?? onboarding);
	}

	return {
		onboardingTemplates: templates,
		onboardingTemplateSteps: templateSteps,
		onboardings,
		personnel,
		groups,
		trainingTypes
	};
}
