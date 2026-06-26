import type { WebhookProcessingState } from '$lib/server/billing/stripeWebhookProcessing';
import type { AdminRole } from '$lib/server/admin';
import type {
	BillingSnapshot,
	BillingSnapshotSource,
	BillingSyncStatus,
	SubscriptionStatus,
	Tier
} from '$lib/types/subscription';

export type BillingHealthState =
	| 'healthy'
	| 'needs_retry'
	| 'permanent_failure'
	| 'drift_detected'
	| 'payment_recovery_attention'
	| 'reconciliation_stale'
	| 'diagnostics_unavailable';

export interface PlatformBillingHealthBillingStateContext {
	source: BillingSnapshotSource | null;
	commercialPlan: Tier | null;
	subscriptionStatus: SubscriptionStatus | null;
	collectionStatus: string | null;
	syncStatus: BillingSyncStatus | null;
	driftDetected: boolean;
}

export interface PlatformBillingHealthLinkedBillingContext {
	organizationId: string;
	organizationName: string | null;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	billingState: PlatformBillingHealthBillingStateContext;
}

export interface PlatformBillingHealthEventRecord {
	id: string;
	type: string;
	objectId: string | null;
	eventCreatedAt: string | null;
	processingState: WebhookProcessingState | null;
	attemptCount: number | null;
	processingResult: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	linkedBillingContext?: PlatformBillingHealthLinkedBillingContext | null;
}

export interface PlatformBillingHealthSnapshotRecord extends BillingSnapshot {
	organizationName: string | null;
}

export interface PlatformBillingSupportBundle {
	organizationId: string | null;
	organizationName: string | null;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	stripeEventIds: string[];
	billingState: PlatformBillingHealthBillingStateContext;
	reconciliationResult: string | null;
	nextSteps: string[];
}

export interface PlatformBillingHealthIssue {
	id: string;
	primaryState: BillingHealthState;
	states: BillingHealthState[];
	severity: 'info' | 'warning' | 'critical';
	title: string;
	detail: string;
	organization: { id: string; name: string | null } | null;
	latestEventIds: string[];
	supportBundle: PlatformBillingSupportBundle;
}

export interface PlatformBillingHealthSummary {
	generatedAt: string;
	overallState: BillingHealthState;
	states: BillingHealthState[];
	counts: {
		retryableFailures: number;
		permanentFailures: number;
		staleFailedEvents: number;
		recentPaymentFailures: number;
		driftedOrganizations: number;
		staleReconciliation: number;
		supportAttentionItems: number;
	};
	issues: PlatformBillingHealthIssue[];
	diagnosticsError: boolean;
}

export interface PlatformBillingHealthStore {
	listRecentHealthEvents(limit: number): Promise<PlatformBillingHealthEventRecord[]>;
	listBillingSnapshotsForHealth(input: {
		limit: number;
		staleReconciledBefore: string;
	}): Promise<PlatformBillingHealthSnapshotRecord[]>;
}

export interface PlatformBillingHealth {
	summarize(input?: { now?: Date }): Promise<PlatformBillingHealthSummary>;
}

export interface PlatformBillingHealthDependencies {
	store: PlatformBillingHealthStore;
	adminRole: AdminRole;
	now?: () => Date;
}

const HEALTH_EVENT_LIMIT = 100;
const HEALTH_SNAPSHOT_LIMIT = 100;
const STALE_FAILURE_MS = 24 * 60 * 60 * 1000;
const STALE_RECONCILIATION_MS = 72 * 60 * 60 * 1000;
const VISIBLE_ISSUE_LIMIT = 12;
const STATE_PRIORITY: BillingHealthState[] = [
	'permanent_failure',
	'diagnostics_unavailable',
	'needs_retry',
	'drift_detected',
	'payment_recovery_attention',
	'reconciliation_stale',
	'healthy'
];

function isBeforeIso(value: string | null, cutoff: Date): boolean {
	if (!value) return true;
	const time = new Date(value).getTime();
	return Number.isFinite(time) && time < cutoff.getTime();
}

function uniqueStates(states: BillingHealthState[]): BillingHealthState[] {
	return [...new Set(states)];
}

function sortStatesByPriority(states: BillingHealthState[]): BillingHealthState[] {
	const unique = uniqueStates(states);
	return unique.sort((left, right) => STATE_PRIORITY.indexOf(left) - STATE_PRIORITY.indexOf(right));
}

function issuePriority(issue: PlatformBillingHealthIssue): number {
	return Math.min(...issue.states.map((state) => STATE_PRIORITY.indexOf(state)));
}

function sortIssuesByPriority(issues: PlatformBillingHealthIssue[]): PlatformBillingHealthIssue[] {
	return [...issues].sort((left, right) => issuePriority(left) - issuePriority(right));
}

function overallStateFor(states: BillingHealthState[]): BillingHealthState {
	return sortStatesByPriority(states)[0] ?? 'healthy';
}

function severityFor(states: BillingHealthState[]): PlatformBillingHealthIssue['severity'] {
	if (states.includes('permanent_failure')) return 'critical';
	if (
		states.includes('needs_retry') ||
		states.includes('drift_detected') ||
		states.includes('payment_recovery_attention')
	) {
		return 'warning';
	}
	return 'info';
}

function nextStepsFor(states: BillingHealthState[]): string[] {
	const steps: string[] = [];
	if (states.includes('needs_retry')) steps.push('Use Retry event on Billing Events');
	if (states.includes('permanent_failure')) steps.push('Copy bundle and escalate permanent webhook failure');
	if (states.includes('payment_recovery_attention')) steps.push('Ask an owner to update payment in Billing Portal');
	if (states.includes('drift_detected')) steps.push('Open org diagnostics and Refresh from Stripe');
	if (states.includes('reconciliation_stale')) steps.push('Refresh from Stripe in org diagnostics');
	if (states.includes('diagnostics_unavailable')) steps.push('Reload diagnostics before customer follow-up');
	return steps;
}

function titleFor(primaryState: BillingHealthState): string {
	switch (primaryState) {
		case 'needs_retry':
			return 'Retryable webhook failure';
		case 'permanent_failure':
			return 'Permanent webhook failure';
		case 'drift_detected':
			return 'Billing drift detected';
		case 'payment_recovery_attention':
			return 'Payment recovery attention';
		case 'reconciliation_stale':
			return 'Reconciliation stale';
		case 'diagnostics_unavailable':
			return 'Billing diagnostics unavailable';
		case 'healthy':
			return 'Billing healthy';
	}
}

function eventTimestamp(event: PlatformBillingHealthEventRecord): string | null {
	return event.eventCreatedAt ?? event.updatedAt ?? event.createdAt;
}

function emptyBillingStateContext(): PlatformBillingHealthBillingStateContext {
	return {
		source: null,
		commercialPlan: null,
		subscriptionStatus: null,
		collectionStatus: null,
		syncStatus: null,
		driftDetected: false
	};
}

function visibleProviderId(role: AdminRole, value: string | null): string | null {
	return role === 'support' ? null : value;
}

function visibleProviderEventIds(role: AdminRole, eventIds: string[]): string[] {
	return role === 'support' ? [] : [...eventIds];
}

function eventIssueIdFor(event: PlatformBillingHealthEventRecord, role: AdminRole): string {
	if (role !== 'support') return `event:${event.id}`;
	const organizationId = event.linkedBillingContext?.organizationId ?? 'unlinked';
	return `event:${organizationId}:${event.type}:${event.processingState ?? 'unknown'}:${eventTimestamp(event) ?? 'unknown'}:${event.attemptCount ?? 0}`;
}

function billingStateNeedsPaymentRecovery(state: PlatformBillingHealthBillingStateContext | null | undefined): boolean {
	return (
		state?.subscriptionStatus === 'past_due' ||
		state?.subscriptionStatus === 'unpaid' ||
		state?.collectionStatus === 'payment_failed_grace' ||
		state?.collectionStatus === 'payment_failed_terminal'
	);
}

function isUnresolvedPaymentFailureEvent(event: PlatformBillingHealthEventRecord): boolean {
	if (event.type !== 'invoice.payment_failed') return false;
	if (event.processingState !== 'retryable_failed' && event.processingState !== 'permanently_failed') return false;
	const currentBillingState = event.linkedBillingContext?.billingState;
	return !currentBillingState || billingStateNeedsPaymentRecovery(currentBillingState);
}

function buildEventIssue(
	event: PlatformBillingHealthEventRecord,
	now: Date,
	adminRole: AdminRole
): PlatformBillingHealthIssue | null {
	const states: BillingHealthState[] = [];
	if (event.processingState === 'retryable_failed') states.push('needs_retry');
	if (event.processingState === 'permanently_failed') states.push('permanent_failure');
	if (isUnresolvedPaymentFailureEvent(event)) states.push('payment_recovery_attention');

	if (states.length === 0) return null;

	const staleCutoff = new Date(now.getTime() - STALE_FAILURE_MS);
	const isStaleFailure =
		(event.processingState === 'retryable_failed' || event.processingState === 'permanently_failed') &&
		isBeforeIso(eventTimestamp(event), staleCutoff);
	const nextSteps = nextStepsFor(states);
	if (isStaleFailure) nextSteps.push('Copy bundle if retry does not clear stale failure');
	const primaryState = states[0];
	const linkedContext = event.linkedBillingContext ?? null;
	const organization = linkedContext
		? { id: linkedContext.organizationId, name: linkedContext.organizationName }
		: null;
	const latestEventIds = visibleProviderEventIds(adminRole, [event.id]);

	return {
		id: eventIssueIdFor(event, adminRole),
		primaryState,
		states: uniqueStates(states),
		severity: severityFor(states),
		title: titleFor(primaryState),
		detail: `${event.type} is ${event.processingState ?? 'unknown'} with ${event.attemptCount ?? 0} attempts.`,
		organization,
		latestEventIds,
		supportBundle: {
			organizationId: linkedContext?.organizationId ?? null,
			organizationName: linkedContext?.organizationName ?? null,
			stripeCustomerId: visibleProviderId(adminRole, linkedContext?.stripeCustomerId ?? null),
			stripeSubscriptionId: visibleProviderId(adminRole, linkedContext?.stripeSubscriptionId ?? null),
			stripeEventIds: latestEventIds,
			billingState: linkedContext?.billingState ?? emptyBillingStateContext(),
			reconciliationResult: event.processingResult,
			nextSteps
		}
	};
}

function snapshotStates(snapshot: PlatformBillingHealthSnapshotRecord, staleCutoff: Date): BillingHealthState[] {
	const states: BillingHealthState[] = [];
	if (billingStateNeedsPaymentRecovery(snapshot)) {
		states.push('payment_recovery_attention');
	}
	if (snapshot.driftDetected || snapshot.syncStatus === 'needs_reconciliation') states.push('drift_detected');
	if (snapshot.source === 'stripe' && isBeforeIso(snapshot.lastReconciledAt, staleCutoff)) {
		states.push('reconciliation_stale');
	}
	return uniqueStates(states);
}

function snapshotDetailFor(snapshot: PlatformBillingHealthSnapshotRecord, primaryState: BillingHealthState): string {
	const name = snapshot.organizationName ?? 'Organization';
	switch (primaryState) {
		case 'payment_recovery_attention':
			return `${name} payment recovery is ${snapshot.subscriptionStatus ?? 'unknown'} with ${snapshot.collectionStatus ?? 'unknown'} collection.`;
		case 'drift_detected':
			return `${name} billing drift requires reconciliation; sync status is ${snapshot.syncStatus}.`;
		case 'reconciliation_stale':
			return `${name} reconciliation is stale; last reconciled at ${snapshot.lastReconciledAt ?? 'unknown'}.`;
		default:
			return `${name} billing is ${snapshot.syncStatus}.`;
	}
}

function buildSnapshotIssue(
	snapshot: PlatformBillingHealthSnapshotRecord,
	staleCutoff: Date,
	adminRole: AdminRole
): PlatformBillingHealthIssue | null {
	const states = sortStatesByPriority(snapshotStates(snapshot, staleCutoff));
	if (states.length === 0) return null;
	const primaryState = states[0];
	const latestEventIds = visibleProviderEventIds(
		adminRole,
		snapshot.lastStripeEventId ? [snapshot.lastStripeEventId] : []
	);

	return {
		id: `snapshot:${snapshot.organizationId}`,
		primaryState,
		states,
		severity: severityFor(states),
		title: titleFor(primaryState),
		detail: snapshotDetailFor(snapshot, primaryState),
		organization: { id: snapshot.organizationId, name: snapshot.organizationName },
		latestEventIds,
		supportBundle: {
			organizationId: snapshot.organizationId,
			organizationName: snapshot.organizationName,
			stripeCustomerId: visibleProviderId(adminRole, snapshot.stripeCustomerId),
			stripeSubscriptionId: visibleProviderId(adminRole, snapshot.stripeSubscriptionId),
			stripeEventIds: latestEventIds,
			billingState: {
				source: snapshot.source,
				commercialPlan: snapshot.commercialPlan,
				subscriptionStatus: snapshot.subscriptionStatus,
				collectionStatus: snapshot.collectionStatus,
				syncStatus: snapshot.syncStatus,
				driftDetected: snapshot.driftDetected
			},
			reconciliationResult: snapshot.reconciliationResult,
			nextSteps: nextStepsFor(states)
		}
	};
}

function emptySummary(now: Date, diagnosticsError = false): PlatformBillingHealthSummary {
	const states: BillingHealthState[] = diagnosticsError ? ['diagnostics_unavailable'] : ['healthy'];
	return {
		generatedAt: now.toISOString(),
		overallState: states[0],
		states,
		counts: {
			retryableFailures: 0,
			permanentFailures: 0,
			staleFailedEvents: 0,
			recentPaymentFailures: 0,
			driftedOrganizations: 0,
			staleReconciliation: 0,
			supportAttentionItems: 0
		},
		issues: [],
		diagnosticsError
	};
}

export function mapBillingHealthSummary(input: {
	events: PlatformBillingHealthEventRecord[];
	snapshots: PlatformBillingHealthSnapshotRecord[];
	adminRole: AdminRole;
	now: Date;
	diagnosticsError?: boolean;
}): PlatformBillingHealthSummary {
	const staleFailureCutoff = new Date(input.now.getTime() - STALE_FAILURE_MS);
	const staleReconciliationCutoff = new Date(input.now.getTime() - STALE_RECONCILIATION_MS);
	const eventIssues = input.events.flatMap((event) => {
		const issue = buildEventIssue(event, input.now, input.adminRole);
		return issue ? [issue] : [];
	});
	const snapshotIssues = input.snapshots.flatMap((snapshot) => {
		const issue = buildSnapshotIssue(snapshot, staleReconciliationCutoff, input.adminRole);
		return issue ? [issue] : [];
	});
	const allIssues = [...eventIssues, ...snapshotIssues];
	const visibleIssues = sortIssuesByPriority(allIssues).slice(0, VISIBLE_ISSUE_LIMIT);
	const issueStates = allIssues.flatMap((issue) => issue.states);

	const states = sortStatesByPriority(
		input.diagnosticsError ? [...issueStates, 'diagnostics_unavailable'] : issueStates
	);
	if (states.length === 0) return emptySummary(input.now, input.diagnosticsError ?? false);

	const retryableFailures = input.events.filter((event) => event.processingState === 'retryable_failed').length;
	const permanentFailures = input.events.filter((event) => event.processingState === 'permanently_failed').length;
	const staleFailedEvents = input.events.filter(
		(event) =>
			(event.processingState === 'retryable_failed' || event.processingState === 'permanently_failed') &&
			isBeforeIso(eventTimestamp(event), staleFailureCutoff)
	).length;
	const recentPaymentFailures =
		input.events.filter(isUnresolvedPaymentFailureEvent).length +
		input.snapshots.filter((snapshot) =>
			snapshotStates(snapshot, staleReconciliationCutoff).includes('payment_recovery_attention')
		).length;
	const driftedOrganizations = input.snapshots.filter((snapshot) =>
		snapshotStates(snapshot, staleReconciliationCutoff).includes('drift_detected')
	).length;
	const staleReconciliation = input.snapshots.filter((snapshot) =>
		snapshotStates(snapshot, staleReconciliationCutoff).includes('reconciliation_stale')
	).length;
	return {
		generatedAt: input.now.toISOString(),
		overallState: overallStateFor(states),
		states,
		counts: {
			retryableFailures,
			permanentFailures,
			staleFailedEvents,
			recentPaymentFailures,
			driftedOrganizations,
			staleReconciliation,
			supportAttentionItems: allIssues.length
		},
		issues: visibleIssues,
		diagnosticsError: input.diagnosticsError ?? false
	};
}

export function createPlatformBillingHealth(deps: PlatformBillingHealthDependencies): PlatformBillingHealth {
	return {
		async summarize(input = {}) {
			const now = input.now ?? deps.now?.() ?? new Date();
			const staleReconciledBefore = new Date(now.getTime() - STALE_RECONCILIATION_MS).toISOString();
			try {
				const [events, snapshots] = await Promise.all([
					deps.store.listRecentHealthEvents(HEALTH_EVENT_LIMIT),
					deps.store.listBillingSnapshotsForHealth({
						limit: HEALTH_SNAPSHOT_LIMIT,
						staleReconciledBefore
					})
				]);
				return mapBillingHealthSummary({
					events,
					snapshots,
					adminRole: deps.adminRole,
					now
				});
			} catch (error) {
				console.error('Admin billing health query failed:', error);
				return emptySummary(now, true);
			}
		}
	};
}
