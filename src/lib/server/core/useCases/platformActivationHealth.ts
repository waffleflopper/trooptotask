import type { BillingSnapshotSource, BillingSyncStatus, SubscriptionStatus, Tier } from '$lib/types/subscription';

export const MEANINGFUL_ROSTER_THRESHOLD = 5;

export type PlatformActivationHealthState =
	| 'activated'
	| 'needs_attention'
	| 'in_progress'
	| 'no_candidates'
	| 'diagnostics_unavailable';

export type PlatformActivationMilestoneId =
	| 'signup_submitted'
	| 'email_confirmed'
	| 'organization_created'
	| 'checkout_started'
	| 'checkout_completed'
	| 'meaningful_roster'
	| 'leader_accepted'
	| 'defaults_present'
	| 'duty_roster_started'
	| 'setup_started';

export type PlatformActivationMilestoneState = 'complete' | 'incomplete' | 'deferred';

export interface PlatformActivationBillingContext {
	source: BillingSnapshotSource | null;
	commercialPlan: Tier | null;
	subscriptionStatus: SubscriptionStatus | null;
	collectionStatus: string | null;
	syncStatus: BillingSyncStatus | null;
}

export interface PlatformActivationCheckoutContext {
	attemptCount: number;
	completedCount: number;
	interruptedCount: number;
	inProgressCount: number;
	latestStatus: string | null;
	latestAt: string | null;
}

export interface PlatformActivationSetupCounts {
	activePersonnel: number;
	members: number;
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
	billing: PlatformActivationBillingContext | null;
	checkout: PlatformActivationCheckoutContext;
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
		checkoutStarted: boolean;
		checkoutCompleted: boolean;
		checkoutRecovered: boolean;
		latestCheckoutStatus: string | null;
		billingState: PlatformActivationBillingContext | null;
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
		checkoutStarted: number;
		checkoutCompleted: number;
		meaningfulRosters: number;
		acceptedLeaders: number;
		dutyRosterStarted: number;
		setupStarted: number;
		paidBelowRosterThreshold: number;
		supportAttentionItems: number;
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
const PAID_PLANS = new Set<Tier>(['team', 'unit']);
const ACTIVE_OR_RECOVERABLE_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
	'active',
	'trialing',
	'past_due',
	'unpaid',
	'incomplete',
	'paused'
]);
const CHECKOUT_COMPLETED_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
	'active',
	'trialing',
	'past_due',
	'unpaid',
	'paused'
]);
const INFERRED_ACQUISITION_MILESTONES = new Set<PlatformActivationMilestoneId>([
	'signup_submitted',
	'email_confirmed',
	'organization_created'
]);

function isStripePaidBillingContext(context: PlatformActivationBillingContext | null): boolean {
	return (
		context?.source === 'stripe' &&
		!!context.commercialPlan &&
		PAID_PLANS.has(context.commercialPlan) &&
		!!context.subscriptionStatus &&
		ACTIVE_OR_RECOVERABLE_SUBSCRIPTION_STATUSES.has(context.subscriptionStatus)
	);
}

function isStripeCheckoutCompletedBillingContext(context: PlatformActivationBillingContext | null): boolean {
	return (
		context?.source === 'stripe' &&
		!!context.commercialPlan &&
		PAID_PLANS.has(context.commercialPlan) &&
		!!context.subscriptionStatus &&
		CHECKOUT_COMPLETED_SUBSCRIPTION_STATUSES.has(context.subscriptionStatus)
	);
}

function hasCheckoutStarted(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.checkout.attemptCount > 0 || isStripePaidBillingContext(facts.billing);
}

function hasCheckoutCompleted(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.checkout.completedCount > 0 || isStripeCheckoutCompletedBillingContext(facts.billing);
}

function hasPaidAcquisitionSignal(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.checkout.attemptCount > 0 || isStripePaidBillingContext(facts.billing);
}

function hasCheckoutRecovered(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.checkout.interruptedCount > 0 && hasCheckoutCompleted(facts);
}

function hasMeaningfulRoster(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.counts.activePersonnel >= MEANINGFUL_ROSTER_THRESHOLD;
}

function hasAcceptedLeader(facts: PlatformActivationOrganizationFacts): boolean {
	return facts.counts.members > 1;
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

function checkoutAttemptCountDetail(count: number): string {
	return `${count} checkout attempt${count === 1 ? '' : 's'} recorded.`;
}

function billingStateDetail(context: PlatformActivationBillingContext): string {
	return `${context.subscriptionStatus ?? 'unknown'} / ${context.collectionStatus ?? 'unknown'}`;
}

function checkoutStartedDetail(facts: PlatformActivationOrganizationFacts, checkoutStarted: boolean): string {
	if (!checkoutStarted) return 'No checkout attempt or paid billing snapshot is visible.';
	if (facts.checkout.attemptCount > 0) return checkoutAttemptCountDetail(facts.checkout.attemptCount);
	if (facts.billing && isStripePaidBillingContext(facts.billing)) {
		return `Paid billing snapshot is ${billingStateDetail(facts.billing)}; no checkout attempt rows were returned.`;
	}
	return 'Checkout start is visible from existing activation facts.';
}

function checkoutCompletedDetail(facts: PlatformActivationOrganizationFacts, checkoutCompleted: boolean): string {
	if (checkoutCompleted) {
		if (facts.checkout.completedCount > 0) {
			return `${facts.checkout.completedCount} completed checkout attempt${facts.checkout.completedCount === 1 ? '' : 's'} recorded.`;
		}
		if (facts.billing && isStripeCheckoutCompletedBillingContext(facts.billing)) {
			return `Paid billing snapshot is ${billingStateDetail(facts.billing)}.`;
		}
		return 'Checkout completion is visible from existing activation facts.';
	}
	if (facts.checkout.latestStatus) return `Latest checkout status is ${facts.checkout.latestStatus}.`;
	if (facts.billing) {
		return `Billing snapshot is ${billingStateDetail(facts.billing)}; checkout completion has not been confirmed.`;
	}
	return 'No completed checkout attempt or completed paid billing snapshot is visible.';
}

function milestonesFor(facts: PlatformActivationOrganizationFacts): PlatformActivationMilestone[] {
	const paidAcquisitionSignal = hasPaidAcquisitionSignal(facts);
	const checkoutStarted = hasCheckoutStarted(facts);
	const checkoutCompleted = hasCheckoutCompleted(facts);
	const checkoutRecovered = hasCheckoutRecovered(facts);

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
		paidAcquisitionSignal
			? milestone(
					'checkout_started',
					'Checkout started',
					checkoutStarted,
					checkoutStartedDetail(facts, checkoutStarted)
				)
			: deferredMilestone(
					'checkout_started',
					'Checkout started',
					'No paid checkout signal; free activation is scored from product-value milestones.'
				),
		paidAcquisitionSignal
			? milestone(
					'checkout_completed',
					checkoutRecovered ? 'Checkout recovered' : 'Checkout completed',
					checkoutCompleted,
					checkoutCompletedDetail(facts, checkoutCompleted)
				)
			: deferredMilestone(
					'checkout_completed',
					'Checkout completed',
					'No paid checkout signal; free activation is scored from product-value milestones.'
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
			`${facts.counts.members} accepted Organization Member${facts.counts.members === 1 ? '' : 's'} recorded.`
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
	const paidAcquisitionSignal = hasPaidAcquisitionSignal(facts);
	const checkoutStarted = hasCheckoutStarted(facts);
	const checkoutCompleted = hasCheckoutCompleted(facts);

	if (paidAcquisitionSignal && checkoutStarted && !checkoutCompleted)
		steps.push('Follow up on checkout completion before evaluating activation.');
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

function stateFor(facts: PlatformActivationOrganizationFacts, nextSteps: string[]): PlatformActivationHealthState {
	if (nextSteps.length === 0) return 'activated';
	if (hasCheckoutCompleted(facts)) return 'needs_attention';
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
			organizationCreatedAt: facts.organizationCreatedAt,
			checkoutStarted: hasCheckoutStarted(facts),
			checkoutCompleted: hasCheckoutCompleted(facts),
			checkoutRecovered: hasCheckoutRecovered(facts),
			latestCheckoutStatus: facts.checkout.latestStatus,
			billingState: facts.billing
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
		state: stateFor(facts, nextSteps),
		score: scoreFor(milestones),
		milestones,
		nextSteps,
		supportBundle: supportBundleFor(facts, nextSteps)
	};
}

function organizationSortKey(health: PlatformActivationOrganizationHealth): number {
	if (health.state === 'needs_attention') return 0;
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
		checkoutStarted: 0,
		checkoutCompleted: 0,
		meaningfulRosters: 0,
		acceptedLeaders: 0,
		dutyRosterStarted: 0,
		setupStarted: 0,
		paidBelowRosterThreshold: 0,
		supportAttentionItems: 0
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
	const supportAttentionItems = organizations.filter((item) => item.state === 'needs_attention').length;
	const counts = {
		candidateOrganizations: organizations.length,
		activatedOrganizations,
		checkoutStarted: input.facts.filter(hasCheckoutStarted).length,
		checkoutCompleted: input.facts.filter(hasCheckoutCompleted).length,
		meaningfulRosters: input.facts.filter(hasMeaningfulRoster).length,
		acceptedLeaders: input.facts.filter(hasAcceptedLeader).length,
		dutyRosterStarted: input.facts.filter(hasDutyRosterActivity).length,
		setupStarted: input.facts.filter(hasSetupStarted).length,
		paidBelowRosterThreshold: input.facts.filter((facts) => hasCheckoutCompleted(facts) && !hasMeaningfulRoster(facts))
			.length,
		supportAttentionItems
	};
	const overallState: PlatformActivationHealthState =
		organizations.length === 0
			? 'no_candidates'
			: supportAttentionItems > 0
				? 'needs_attention'
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
