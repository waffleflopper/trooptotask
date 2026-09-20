export const MEANINGFUL_ROSTER_THRESHOLD = 5;

export type PlatformActivationHealthState = 'activated' | 'in_progress' | 'no_candidates' | 'diagnostics_unavailable';

export type PlatformActivationMilestoneId =
	| 'signup_submitted'
	| 'email_confirmed'
	| 'organization_created'
	| 'meaningful_roster'
	| 'leader_accepted'
	| 'defaults_present'
	| 'duty_roster_started'
	| 'setup_started';

export type PlatformActivationMilestoneState = 'complete' | 'incomplete' | 'deferred';

export interface PlatformActivationSetupCounts {
	activePersonnel: number;
	members: number;
	leaderMembers: number;
	statusTypes: number;
	assignmentTypes: number;
	dutyRosterTemplates: number;
	dutyRosterRuns: number;
	dutyRosterHistory: number;
	onboardingTemplateSteps: number;
	trainingTypes: number;
	ratingSchemeEntries: number;
}

export interface PlatformActivationOrganizationFacts {
	organizationId: string;
	organizationName: string | null;
	organizationCreatedAt: string | null;
	counts: PlatformActivationSetupCounts;
}

export interface PlatformActivationMilestone {
	id: PlatformActivationMilestoneId;
	label: string;
	state: PlatformActivationMilestoneState;
	detail: string;
}

export interface PlatformActivationSupportBundle {
	organizationId: string;
	organizationName: string | null;
	acquisition: {
		organizationCreatedAt: string | null;
	};
	activation: PlatformActivationSetupCounts & {
		meaningfulRosterThreshold: number;
	};
	nextSteps: string[];
}

export interface PlatformActivationOrganizationHealth {
	id: string;
	organization: { id: string; name: string | null };
	state: PlatformActivationHealthState;
	score: number;
	milestones: PlatformActivationMilestone[];
	nextSteps: string[];
	supportBundle: PlatformActivationSupportBundle;
}

export interface PlatformActivationHealthSummary {
	generatedAt: string;
	overallState: PlatformActivationHealthState;
	candidateLimit: number;
	counts: {
		candidateOrganizations: number;
		activatedOrganizations: number;
		meaningfulRosters: number;
		acceptedLeaders: number;
		dutyRosterStarted: number;
		setupStarted: number;
		inProgressOrganizations: number;
	};
	organizations: PlatformActivationOrganizationHealth[];
	diagnosticsError: boolean;
}

export interface PlatformActivationHealthStore {
	listActivationOrganizationFacts(input: { limit: number }): Promise<PlatformActivationOrganizationFacts[]>;
}

export interface PlatformActivationHealth {
	summarize(input?: { now?: Date }): Promise<PlatformActivationHealthSummary>;
}

export interface PlatformActivationHealthDependencies {
	store: PlatformActivationHealthStore;
	now?: () => Date;
}

const ACTIVATION_ORGANIZATION_LIMIT = 100;
const VISIBLE_ORGANIZATION_LIMIT = 12;
const INFERRED_ACQUISITION_MILESTONES = new Set<PlatformActivationMilestoneId>([
	'signup_submitted',
	'email_confirmed',
	'organization_created'
]);

function hasMeaningfulRoster(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.counts.activePersonnel >= MEANINGFUL_ROSTER_THRESHOLD;
}

function hasAcceptedLeader(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.counts.leaderMembers > 1;
}

function hasDutyRosterActivity(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.counts.dutyRosterTemplates > 0 || facts.counts.dutyRosterRuns > 0 || facts.counts.dutyRosterHistory > 0;
}

function hasSetupStarted(facts: PlatformActivationOrganizationFacts): boolean {
	return (
		facts.counts.onboardingTemplateSteps > 0 || facts.counts.trainingTypes > 0 || facts.counts.ratingSchemeEntries > 0
	);
}

function milestone(
	id: PlatformActivationMilestoneId,
	label: string,
	complete: boolean,
	detail: string
): PlatformActivationMilestone {
	return {
		id,
		label,
		state: complete ? 'complete' : 'incomplete',
		detail
	};
}

function deferredMilestone(
	id: PlatformActivationMilestoneId,
	label: string,
	detail: string
): PlatformActivationMilestone {
	return {
		id,
		label,
		state: 'deferred',
		detail
	};
}

function milestonesFor(facts: PlatformActivationOrganizationFacts): PlatformActivationMilestone[] {
	return [
		milestone(
			'signup_submitted',
			'Signup submitted',
			true,
			'Inferred for activation health after Organization creation; exact account questions stay in Admin -> Users.'
		),
		milestone(
			'email_confirmed',
			'Email confirmed',
			true,
			'Organization creation is email-confirmation gated; use Admin -> Users for the exact account timestamp.'
		),
		milestone(
			'organization_created',
			'Organization created',
			!!facts.organizationCreatedAt,
			facts.organizationCreatedAt
				? `Created ${facts.organizationCreatedAt}.`
				: 'Organization creation timestamp was unavailable.'
		),
		milestone(
			'meaningful_roster',
			'Meaningful roster',
			hasMeaningfulRoster(facts),
			`${facts.counts.activePersonnel} active personnel; threshold is ${MEANINGFUL_ROSTER_THRESHOLD}.`
		),
		milestone(
			'leader_accepted',
			'Leader accepted',
			hasAcceptedLeader(facts),
			`${facts.counts.leaderMembers} accepted owner/admin membership${facts.counts.leaderMembers === 1 ? '' : 's'} recorded; ${facts.counts.members} total accepted Organization Member${facts.counts.members === 1 ? '' : 's'}.`
		),
		deferredMilestone(
			'defaults_present',
			'Defaults present',
			`${facts.counts.statusTypes} status types and ${facts.counts.assignmentTypes} assignment types exist. Reviewed-state persistence is deferred.`
		),
		milestone(
			'duty_roster_started',
			'First Duty Roster activity',
			hasDutyRosterActivity(facts),
			`${facts.counts.dutyRosterTemplates} templates, ${facts.counts.dutyRosterRuns} accepted runs, ${facts.counts.dutyRosterHistory} legacy runs.`
		),
		milestone(
			'setup_started',
			'Setup started',
			hasSetupStarted(facts),
			`${facts.counts.onboardingTemplateSteps} onboarding steps, ${facts.counts.trainingTypes} training types, ${facts.counts.ratingSchemeEntries} eval entries.`
		)
	];
}

function nextStepsFor(facts: PlatformActivationOrganizationFacts): string[] {
	const steps: string[] = [];
	if (!hasMeaningfulRoster(facts)) {
		steps.push(`Import or add at least ${MEANINGFUL_ROSTER_THRESHOLD} active personnel.`);
	}
	if (!hasAcceptedLeader(facts))
		steps.push('Invite another leader and confirm the Organization Membership is accepted.');
	if (!hasDutyRosterActivity(facts)) steps.push('Create the first Duty Roster template or accepted run.');
	if (!hasSetupStarted(facts))
		steps.push('Start onboarding, training, or eval setup with existing configuration records.');

	return steps;
}

function stateFor(nextSteps: string[]): PlatformActivationHealthState {
	if (nextSteps.length === 0) return 'activated';
	return 'in_progress';
}

function scoreFor(milestones: PlatformActivationMilestone[]): number {
	const scoredMilestones = milestones.filter(
		(item) => item.state !== 'deferred' && !INFERRED_ACQUISITION_MILESTONES.has(item.id)
	);
	if (scoredMilestones.length === 0) return 0;
	const completeCount = scoredMilestones.filter((item) => item.state === 'complete').length;
	return Math.round((completeCount / scoredMilestones.length) * 100);
}

function supportBundleFor(
	facts: PlatformActivationOrganizationFacts,
	nextSteps: string[]
): PlatformActivationSupportBundle {
	return {
		organizationId: facts.organizationId,
		organizationName: facts.organizationName,
		acquisition: {
			organizationCreatedAt: facts.organizationCreatedAt
		},
		activation: {
			...facts.counts,
			meaningfulRosterThreshold: MEANINGFUL_ROSTER_THRESHOLD
		},
		nextSteps
	};
}

function organizationHealthFor(facts: PlatformActivationOrganizationFacts): PlatformActivationOrganizationHealth {
	const milestones = milestonesFor(facts);
	const nextSteps = nextStepsFor(facts);

	return {
		id: facts.organizationId,
		organization: { id: facts.organizationId, name: facts.organizationName },
		state: stateFor(nextSteps),
		score: scoreFor(milestones),
		milestones,
		nextSteps,
		supportBundle: supportBundleFor(facts, nextSteps)
	};
}

function organizationSortKey(health: PlatformActivationOrganizationHealth): number {
	if (health.state === 'in_progress') return 1;
	return 2;
}

function sortOrganizations(
	organizations: PlatformActivationOrganizationHealth[]
): PlatformActivationOrganizationHealth[] {
	return [...organizations].sort((left, right) => {
		const stateDiff = organizationSortKey(left) - organizationSortKey(right);
		if (stateDiff !== 0) return stateDiff;
		return left.score - right.score;
	});
}

function emptyCounts(): PlatformActivationHealthSummary['counts'] {
	return {
		candidateOrganizations: 0,
		activatedOrganizations: 0,
		meaningfulRosters: 0,
		acceptedLeaders: 0,
		dutyRosterStarted: 0,
		setupStarted: 0,
		inProgressOrganizations: 0
	};
}

export function degradedActivationHealthSummary(now = new Date()): PlatformActivationHealthSummary {
	return {
		generatedAt: now.toISOString(),
		overallState: 'diagnostics_unavailable',
		candidateLimit: ACTIVATION_ORGANIZATION_LIMIT,
		counts: emptyCounts(),
		organizations: [],
		diagnosticsError: true
	};
}

export function mapActivationHealthSummary(input: {
	facts: PlatformActivationOrganizationFacts[];
	now: Date;
	diagnosticsError?: boolean;
}): PlatformActivationHealthSummary {
	if (input.diagnosticsError) return degradedActivationHealthSummary(input.now);

	const organizations = input.facts.map(organizationHealthFor);
	const activatedOrganizations = organizations.filter((item) => item.state === 'activated').length;
	const inProgressOrganizations = organizations.filter((item) => item.state === 'in_progress').length;
	const counts = {
		candidateOrganizations: organizations.length,
		activatedOrganizations,
		meaningfulRosters: input.facts.filter(hasMeaningfulRoster).length,
		acceptedLeaders: input.facts.filter(hasAcceptedLeader).length,
		dutyRosterStarted: input.facts.filter(hasDutyRosterActivity).length,
		setupStarted: input.facts.filter(hasSetupStarted).length,
		inProgressOrganizations
	};
	const overallState: PlatformActivationHealthState =
		organizations.length === 0
			? 'no_candidates'
			: activatedOrganizations === organizations.length
				? 'activated'
				: 'in_progress';

	return {
		generatedAt: input.now.toISOString(),
		overallState,
		candidateLimit: ACTIVATION_ORGANIZATION_LIMIT,
		counts,
		organizations: sortOrganizations(organizations).slice(0, VISIBLE_ORGANIZATION_LIMIT),
		diagnosticsError: false
	};
}

export function createPlatformActivationHealth(deps: PlatformActivationHealthDependencies): PlatformActivationHealth {
	return {
		async summarize(input = {}) {
			const now = input.now ?? deps.now?.() ?? new Date();
			try {
				return mapActivationHealthSummary({
					facts: await deps.store.listActivationOrganizationFacts({ limit: ACTIVATION_ORGANIZATION_LIMIT }),
					now
				});
			} catch (err) {
				console.error('Admin activation health query failed:', err);
				return degradedActivationHealthSummary(now);
			}
		}
	};
}
