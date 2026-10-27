import { error } from '@sveltejs/kit';
import { evaluatePolicyDecision, POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	buildLayoutRequest,
	createRequestRankCatalogContext,
	createRequestUnitCountsContext,
	type AdmittedOrganizationRequest
} from '$lib/server/adapters/requestContexts.server';
import {
	loadOrganizationSetupFacts,
	createSupabaseOrganizationSetupPort,
	createSupabaseOrganizationSettingsReader,
	resolveOrganizationRouteIdentity,
	readUnitCounts,
	type SetupFactReads
} from '$features/organization/index.server';
import {
	getPreferredOrganizationUrlSegment,
	type SetupFacts,
	type OrganizationSetup
} from '$features/organization/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';

export interface SetupLayoutData {
	orgId: string;
	orgUrlSegment: string;
	orgName: string;
	isOwner: boolean;
	disabledFeatures: readonly FeatureKey[];
	setupState: OrganizationSetup;
	setupFacts: Promise<SetupFacts>;
}

export function streamSetupData(request: AdmittedOrganizationRequest) {
	const setup = createSupabaseOrganizationSetupPort(request.supabase);
	return { state: setup.read(request.auth.orgId), facts: streamSetupFacts(request) };
}

export function streamSetupFacts(request: AdmittedOrganizationRequest, reuse: Partial<SetupFactReads> = {}) {
	const settings = createSupabaseOrganizationSettingsReader(request.supabase);
	const { unitCounts } = createRequestUnitCountsContext(request);
	const rankContext = createRequestRankCatalogContext(request);
	return loadOrganizationSetupFacts({
		groups: () => unitCounts.countRows({ table: 'groups' }),
		activeRanks: async () =>
			(await loadOrganizationRankCatalog(rankContext, { authorization: 'organization-governance' })).filter(
				(rank) => rank.state === 'active'
			).length,
		activePeople: async () => (await readUnitCounts(unitCounts, ['activePersonnel'])).activePersonnel,
		statusTypes: async () => (await readUnitCounts(unitCounts, ['statusTypes'])).statusTypes,
		assignmentTypes: async () => (await readUnitCounts(unitCounts, ['assignmentTypes'])).assignmentTypes,
		trainingTypes: async () => (await readUnitCounts(unitCounts, ['trainingTypes'])).trainingTypes,
		criticalTasks: async () => (await readUnitCounts(unitCounts, ['criticalTaskLists'])).criticalTaskLists,
		evaluations: async () => (await readUnitCounts(unitCounts, ['ratingSchemeEntries'])).ratingSchemeEntries,
		onboardingTemplates: async () => (await readUnitCounts(unitCounts, ['onboardingTemplates'])).onboardingTemplates,
		events: async () => (await readUnitCounts(unitCounts, ['calendarEvents'])).calendarEvents,
		taskings: () => unitCounts.countRows({ table: 'calendar_taskings' }),
		members: async () => (await readUnitCounts(unitCounts, ['members'])).members,
		pendingInvitations: () => settings.countPendingInvitations(request.auth.orgId),
		lossWarningWindowDays: async () => {
			const days = await settings.findLossWarningWindowDays(request.auth.orgId);
			if (days == null) throw new Error('Missing loss warning setting');
			return days;
		},
		...reuse
	});
}

const loads = new WeakMap<App.Locals, Map<string, Promise<SetupLayoutData>>>();

export function loadSetupLayout(event: {
	locals: App.Locals;
	params: { orgId: string };
	depends(...dependencies: string[]): void;
}): Promise<SetupLayoutData> {
	event.depends('app:org-core', 'app:organization-setup');
	let organizationLoads = loads.get(event.locals);
	if (!organizationLoads) {
		organizationLoads = new Map();
		loads.set(event.locals, organizationLoads);
	}
	let load = organizationLoads.get(event.params.orgId);
	if (!load) {
		load = readSetupLayout(event);
		organizationLoads.set(event.params.orgId, load);
	}
	return load;
}

async function readSetupLayout(event: { locals: App.Locals; params: { orgId: string } }): Promise<SetupLayoutData> {
	const request = await buildLayoutRequest(event.locals, event.params.orgId);
	const decision = evaluatePolicyDecision({
		decisionKind: 'server-authoritative',
		actor: { membershipRole: request.auth.role, userId: request.auth.userId },
		action: POLICY_ACTION_CATALOG.organization.updateSettings,
		capabilityMap: request.auth.capabilityMap,
		scopeSet: request.auth.scopeSet,
		resource: { kind: 'organization' }
	});
	if (!decision.allowed) error(403, 'You do not have permission to perform this action');
	const identity = await resolveOrganizationRouteIdentity(event.locals, event.params.orgId);
	if (!identity) error(404, 'Organization not found');
	const { state, facts } = streamSetupData(request);
	const setupState = await state;
	return {
		orgId: request.auth.orgId,
		orgUrlSegment: getPreferredOrganizationUrlSegment(identity),
		orgName: identity.name ?? 'Organization',
		isOwner: request.auth.role === 'owner',
		disabledFeatures: request.disabledFeatures,
		setupState,
		setupFacts: keepStreamedRejectionObserved(facts.then((values) => ({ ...values, branch: setupState.branch })))
	};
}
