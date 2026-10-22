import { projectOnboardingTrainingSteps } from '../onboardingTrainingProjection';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import { fetchOnboardingTemplatesData } from './onboardingTemplateRead.server';
import type {
	OnboardingBootstrap,
	OnboardingBootstrapMode,
	OnboardingStartOptions
} from '$features/onboarding/contracts';
import { requireOnboardingViewPolicy } from './onboardingPolicy.server';
import type { OnboardingQueryPorts } from './onboardingPorts.server';
import { personnelScopeResource, type GroupPersistence } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { evaluateFeaturePolicy } from '$lib/access/index.server';
import { typicalDaysToFinish, typicalWindowStart } from '../onboardingStatus';
import { noteAuthorIds, pickNoteAuthorLabels } from '../onboardingNoteAuthors';
import { normalizeRetentionMonths } from './onboardingRetention.server';
import { onboardingResponse, trainingStepsAreManual } from './manualTrainingSteps.server';

export interface FetchOnboardingBootstrapOptions {
	mode?: OnboardingBootstrapMode;
	/** The viewer's day, which ends the typical-days window. The UTC day when unknown. */
	today?: string;
}

type OnboardingStartOptionsPorts = Pick<
	OnboardingQueryPorts,
	'auth' | 'audit' | 'onboardingCatalog' | 'loadRankCatalog'
>;

async function loadPersonnelCreationRanks(
	ctx: OnboardingStartOptionsPorts
): Promise<Pick<OnboardingBootstrap, 'rankCatalog' | 'rankCatalogUnavailable'>> {
	const resource = personnelScopeResource(ctx.auth.scopeSet);
	if (resource === null) return { rankCatalog: [], rankCatalogUnavailable: false };
	const decision = await evaluateFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.createRecords, resource);
	if (!decision.allowed) return { rankCatalog: [], rankCatalogUnavailable: false };

	try {
		return { rankCatalog: await ctx.loadRankCatalog(), rankCatalogUnavailable: false };
	} catch {
		console.error('[onboarding-workspace] Personnel rank catalog unavailable', { organizationId: ctx.auth.orgId });
		return { rankCatalog: [], rankCatalogUnavailable: true };
	}
}

/** Templates for the packet, and the rank catalog when the viewer may add the Person on the way. */
export async function fetchOnboardingStartOptions(ctx: OnboardingStartOptionsPorts): Promise<OnboardingStartOptions> {
	const [{ templates, templateSteps }, ranks] = await Promise.all([
		fetchOnboardingTemplatesData(ctx),
		loadPersonnelCreationRanks(ctx)
	]);
	return { templates, hasTemplateSteps: templateSteps.length > 0, ...ranks };
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

	return ctx.trainingOnboardingReferences.completedTypeIds(ctx, personnelIds, trainingTypeIds);
}

/** Names are decoration on the notes, so a failed lookup leaves them unnamed rather than failing the page. */
async function readNoteAuthorLabels(
	ctx: OnboardingQueryPorts,
	packets: PersonnelOnboarding[]
): Promise<Map<string, string>> {
	try {
		return await ctx.organizationSettings.findMemberLabels(ctx.auth.orgId, noteAuthorIds(packets, ctx.auth.userId));
	} catch {
		console.error('[onboarding-workspace] Note author names unavailable', { organizationId: ctx.auth.orgId });
		return new Map();
	}
}

export async function fetchOnboardingBootstrap(
	ctx: OnboardingQueryPorts & { readonly groups: Pick<GroupPersistence, 'listCatalog'> },
	options: FetchOnboardingBootstrapOptions = {}
): Promise<OnboardingBootstrap> {
	await requireOnboardingViewPolicy(ctx);

	const mode = options.mode ?? 'all';
	const scopedAllPersonnel =
		ctx.auth.scopeSet.kind === 'groups' && mode === 'all'
			? ctx.personnelOnboardingRoster.listRoster(ctx.auth, 'all')
			: null;
	// completed_at is the member's local day, so the window ends on the viewer's day.
	const today = options.today ?? new Date().toISOString().slice(0, 10);
	// Active loads only open packets, so it reads completed dates separately.
	const recentCompletions =
		mode === 'active' ? ctx.onboardingWorkflow.listCompletionsSince(typicalWindowStart(today)) : null;

	const packetsRead = ctx.onboardingWorkflow.listPackets(mode);
	// Authors are known once packets arrive, so their names load alongside the remaining reads.
	const noteAuthorLabelsRead = packetsRead.then((packets) => readNoteAuthorLabels(ctx, packets));
	const retentionRead = mode === 'history' ? ctx.organizationSettings.findArchiveRetentionMonths(ctx.auth.orgId) : null;

	const [
		templateData,
		allOnboardings,
		personnel,
		groups,
		trainingTypeRows,
		scopePersonnel,
		personnelCreationRanks,
		completions,
		noteAuthorLabels,
		retentionMonths
	] = await Promise.all([
		fetchOnboardingTemplatesData(ctx),
		packetsRead,
		ctx.personnelOnboardingRoster.listRoster(ctx.auth, mode === 'history' ? 'all' : 'active'),
		ctx.groups.listCatalog(),
		ctx.trainingOnboardingReferences.listTypes(ctx.auth),
		scopedAllPersonnel,
		loadPersonnelCreationRanks(ctx),
		recentCompletions,
		noteAuthorLabelsRead,
		retentionRead
	]);

	const templates = templateData.templates;
	const templateSteps = templateData.templateSteps;
	const trainingTypes = trainingTypeRows;

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

	if (!trainingStepsAreManual(ctx) && trainingOnboardings.length > 0) {
		const completedTrainingTypeIdsByPersonnelId = await readCompletedTrainingTypeIdsByPersonnelId(
			ctx,
			trainingOnboardings
		);
		const refreshedOnboardingById = new Map(
			trainingOnboardings.map((onboarding) => [
				onboarding.id,
				projectOnboardingTrainingSteps(
					onboarding,
					(trainingTypeId) =>
						completedTrainingTypeIdsByPersonnelId.get(onboarding.personnelId)?.has(trainingTypeId) ?? false
				)
			])
		);

		onboardings = onboardings.map((onboarding) => refreshedOnboardingById.get(onboarding.id) ?? onboarding);
	}

	onboardings = onboardings.map((packet) => onboardingResponse(ctx, packet));

	return {
		onboardingTemplates: templates,
		onboardingTemplateSteps: templateSteps,
		onboardings,
		personnel,
		groups,
		trainingTypes,
		...personnelCreationRanks,
		typicalDaysToFinish: typicalDaysToFinish(
			completions?.map((completion) => ({ status: 'completed' as const, ...completion })) ?? onboardings,
			today
		),
		// Only authors of packets this member's scope shows keep a name.
		noteAuthors: pickNoteAuthorLabels(onboardings, noteAuthorLabels, ctx.auth.userId),
		archiveRetentionMonths: mode === 'history' ? normalizeRetentionMonths(retentionMonths) : null
	};
}
