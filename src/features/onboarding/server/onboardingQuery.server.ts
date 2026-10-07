import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import { fetchOnboardingTemplatesData } from './onboardingTemplateRead.server';
import type { OnboardingBootstrap, OnboardingBootstrapMode } from '$features/onboarding/contracts';
import { PersonnelOnboardingEntity } from './personnelOnboardingEntity.server';
import { requireOnboardingViewPolicy } from './onboardingPolicy.server';
import type { OnboardingQueryPorts, OnboardingReadStore } from './onboardingPorts.server';
import { personnelScopeResource, type GroupPersistence } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { evaluateFeaturePolicy } from '$lib/access/index.server';

export interface FetchOnboardingBootstrapOptions {
	mode?: OnboardingBootstrapMode;
}

async function loadPersonnelCreationRanks(
	ctx: OnboardingQueryPorts
): Promise<Pick<OnboardingBootstrap, 'rankCatalog' | 'rankCatalogUnavailable'>> {
	const resource = personnelScopeResource(ctx.auth.scopeSet);
	if (resource === null) return { rankCatalog: [], rankCatalogUnavailable: false };
	const decision = await evaluateFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.createRecords, resource);
	if (!decision.allowed) return { rankCatalog: [], rankCatalogUnavailable: false };

	try {
		return { rankCatalog: await loadOrganizationRankCatalog(ctx), rankCatalogUnavailable: false };
	} catch {
		console.error('[onboarding-workspace] Personnel rank catalog unavailable', { organizationId: ctx.auth.orgId });
		return { rankCatalog: [], rankCatalogUnavailable: true };
	}
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
	ctx: OnboardingQueryPorts,
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
	ctx: OnboardingQueryPorts & { readonly groups: Pick<GroupPersistence, 'listCatalog'> },
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

	const [templateData, onboardingRows, personnel, groups, trainingTypeRows, scopePersonnel, personnelCreationRanks] =
		await Promise.all([
			fetchOnboardingTemplatesData(ctx),
			ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', orgId, onboardingQuery.filters, {
				select: PersonnelOnboardingEntity.select,
				...(onboardingQuery.inFilters ? { inFilters: onboardingQuery.inFilters } : {})
			}),
			ctx.personnelOnboardingRoster.listRoster(ctx.auth, mode === 'history' ? 'all' : 'active'),
			ctx.groups.listCatalog(),
			ctx.trainingOnboardingReferences.listTypes(ctx.auth),
			scopedAllPersonnel,
			loadPersonnelCreationRanks(ctx)
		]);

	const templates = templateData.templates;
	const templateSteps = templateData.templateSteps;
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
		trainingTypes,
		...personnelCreationRanks
	};
}

/** Saved active packets for separately authorized callers such as the Personnel dashboard. */
export async function listActiveOnboardings(
	store: Pick<OnboardingReadStore, 'findMany'>,
	orgId: string
): Promise<PersonnelOnboarding[]> {
	const rows = await store.findMany<Record<string, unknown>>(
		'personnel_onboardings',
		orgId,
		{ status: 'in_progress' },
		{ select: PersonnelOnboardingEntity.select }
	);
	return PersonnelOnboardingEntity.fromDbArray(rows);
}
