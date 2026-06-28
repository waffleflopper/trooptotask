import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformActivationHealth,
	type PlatformActivationBillingContext,
	type PlatformActivationCheckoutContext,
	type PlatformActivationHealth,
	type PlatformActivationHealthStore,
	type PlatformActivationOrganizationFacts,
	type PlatformActivationSetupCounts
} from '$lib/server/core/useCases/platformActivationHealth';
import type { BillingSnapshotSource, BillingSyncStatus, SubscriptionStatus, Tier } from '$lib/types/subscription';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

interface ActivationOrganizationRow {
	id: string;
	name: string | null;
	created_at: string | null;
}

interface ActivationBillingSnapshotRow {
	organization_id: string;
	source: BillingSnapshotSource | null;
	commercial_plan: Tier | null;
	subscription_status: SubscriptionStatus | null;
	collection_status: string | null;
	sync_status: BillingSyncStatus | null;
	organizations: ActivationOrganizationRow | ActivationOrganizationRow[] | null;
}

interface ActivationCheckoutAttemptRow {
	organization_id: string;
	status: string | null;
	commercial_plan: Exclude<Tier, 'free'> | null;
	created_at: string | null;
	updated_at: string | null;
	completed_at: string | null;
	canceled_at: string | null;
	expires_at: string | null;
	organizations: ActivationOrganizationRow | ActivationOrganizationRow[] | null;
}

interface ActivationCountRow {
	organization_id: string;
}

const ACTIVATION_BILLING_SNAPSHOT_COLUMNS =
	'organization_id, source, commercial_plan, subscription_status, collection_status, sync_status, organizations!inner(id, name, created_at)';
const ACTIVATION_CHECKOUT_ATTEMPT_COLUMNS =
	'organization_id, status, commercial_plan, created_at, updated_at, completed_at, canceled_at, expires_at, organizations!inner(id, name, created_at)';
const PAID_COMMERCIAL_PLANS: Exclude<Tier, 'free'>[] = ['team', 'unit'];
const ACTIVE_OR_RECOVERABLE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
	'active',
	'trialing',
	'past_due',
	'unpaid',
	'incomplete',
	'paused'
];
const CHECKOUT_INTERRUPTED_STATUSES = new Set(['canceled', 'expired', 'failed']);
const EMPTY_COUNTS: PlatformActivationSetupCounts = {
	activePersonnel: 0,
	members: 0,
	statusTypes: 0,
	assignmentTypes: 0,
	dutyRosterTemplates: 0,
	dutyRosterRuns: 0,
	dutyRosterHistory: 0,
	onboardingTemplateSteps: 0,
	trainingTypes: 0,
	ratingSchemeEntries: 0
};

function throwIfSupabaseError(error: unknown): void {
	if (error) throw error;
}

function organizationFromRow(
	row: ActivationBillingSnapshotRow | ActivationCheckoutAttemptRow
): ActivationOrganizationRow | null {
	const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
	return organization ?? null;
}

function emptyCheckoutContext(): PlatformActivationCheckoutContext {
	return {
		attemptCount: 0,
		completedCount: 0,
		interruptedCount: 0,
		inProgressCount: 0,
		latestStatus: null,
		latestAt: null
	};
}

function checkoutAttemptTimestamp(row: ActivationCheckoutAttemptRow): string | null {
	return row.completed_at ?? row.canceled_at ?? row.updated_at ?? row.expires_at ?? row.created_at;
}

function isNewerTimestamp(candidate: string | null, current: string | null): boolean {
	if (!candidate) return false;
	if (!current) return true;
	const candidateTime = new Date(candidate).getTime();
	const currentTime = new Date(current).getTime();
	if (!Number.isFinite(candidateTime)) return false;
	if (!Number.isFinite(currentTime)) return true;
	return candidateTime > currentTime;
}

function createFacts(
	organizationId: string,
	organization: ActivationOrganizationRow | null
): PlatformActivationOrganizationFacts {
	return {
		organizationId,
		organizationName: organization?.name ?? null,
		organizationCreatedAt: organization?.created_at ?? null,
		billing: null,
		checkout: emptyCheckoutContext(),
		counts: { ...EMPTY_COUNTS }
	};
}

function ensureFacts(
	factsByOrgId: Map<string, PlatformActivationOrganizationFacts>,
	organizationId: string,
	organization: ActivationOrganizationRow | null
): PlatformActivationOrganizationFacts {
	let facts = factsByOrgId.get(organizationId);
	if (!facts) {
		facts = createFacts(organizationId, organization);
		factsByOrgId.set(organizationId, facts);
	} else if (!facts.organizationName && organization?.name) {
		facts.organizationName = organization.name;
		facts.organizationCreatedAt = organization.created_at;
	}
	return facts;
}

function billingContextFor(row: ActivationBillingSnapshotRow): PlatformActivationBillingContext {
	return {
		source: row.source,
		commercialPlan: row.commercial_plan,
		subscriptionStatus: row.subscription_status,
		collectionStatus: row.collection_status,
		syncStatus: row.sync_status
	};
}

function applyCheckoutAttempt(facts: PlatformActivationOrganizationFacts, row: ActivationCheckoutAttemptRow): void {
	facts.checkout.attemptCount += 1;
	if (row.status === 'completed') facts.checkout.completedCount += 1;
	if (row.status === 'in_progress') facts.checkout.inProgressCount += 1;
	if (row.status && CHECKOUT_INTERRUPTED_STATUSES.has(row.status)) facts.checkout.interruptedCount += 1;

	const timestamp = checkoutAttemptTimestamp(row);
	if (isNewerTimestamp(timestamp, facts.checkout.latestAt)) {
		facts.checkout.latestAt = timestamp;
		facts.checkout.latestStatus = row.status;
	}
}

function countByOrganization(rows: ActivationCountRow[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
	}
	return counts;
}

async function countRowsByOrganization(
	supabase: SupabaseClient,
	table: string,
	organizationIds: string[],
	options: { activePersonnelOnly?: boolean; activeDutyRosterTemplatesOnly?: boolean } = {}
): Promise<Map<string, number>> {
	let builder = supabase.from(table).select('organization_id').in('organization_id', organizationIds);
	if (options.activePersonnelOnly) builder = builder.is('archived_at', null);
	if (options.activeDutyRosterTemplatesOnly) builder = builder.eq('status', 'active');
	const response = (await builder) as SupabaseResponse<ActivationCountRow[]>;
	throwIfSupabaseError(response.error);
	return countByOrganization(response.data ?? []);
}

function applyCounts(
	factsByOrgId: Map<string, PlatformActivationOrganizationFacts>,
	counts: Map<string, number>,
	field: keyof PlatformActivationSetupCounts
): void {
	for (const [organizationId, count] of counts.entries()) {
		const facts = factsByOrgId.get(organizationId);
		if (facts) facts.counts[field] = count;
	}
}

export function createSupabasePlatformActivationHealthStore(supabase: SupabaseClient): PlatformActivationHealthStore {
	return {
		async listActivationOrganizationFacts(input): Promise<PlatformActivationOrganizationFacts[]> {
			const checkoutCandidateLimit = Math.max(input.limit * 5, input.limit);
			const [snapshotResponse, checkoutCandidateResponse] = (await Promise.all([
				supabase
					.from('organization_billing_snapshots')
					.select(ACTIVATION_BILLING_SNAPSHOT_COLUMNS)
					.eq('source', 'stripe')
					.in('commercial_plan', PAID_COMMERCIAL_PLANS)
					.in('subscription_status', ACTIVE_OR_RECOVERABLE_SUBSCRIPTION_STATUSES)
					.order('last_processed_at', { ascending: false, nullsFirst: false })
					.order('updated_at', { ascending: false })
					.limit(input.limit),
				supabase
					.from('organization_checkout_attempts')
					.select(ACTIVATION_CHECKOUT_ATTEMPT_COLUMNS)
					.in('commercial_plan', PAID_COMMERCIAL_PLANS)
					.order('created_at', { ascending: false })
					.limit(checkoutCandidateLimit)
			])) as [SupabaseResponse<ActivationBillingSnapshotRow[]>, SupabaseResponse<ActivationCheckoutAttemptRow[]>];
			throwIfSupabaseError(snapshotResponse.error);
			throwIfSupabaseError(checkoutCandidateResponse.error);

			const factsByOrgId = new Map<string, PlatformActivationOrganizationFacts>();
			for (const row of snapshotResponse.data ?? []) {
				const facts = ensureFacts(factsByOrgId, row.organization_id, organizationFromRow(row));
				if (!facts.billing) facts.billing = billingContextFor(row);
			}
			for (const row of checkoutCandidateResponse.data ?? []) {
				ensureFacts(factsByOrgId, row.organization_id, organizationFromRow(row));
			}

			const organizationIds = [...factsByOrgId.keys()].slice(0, input.limit);
			if (organizationIds.length === 0) return [];

			const checkoutResponse = (await supabase
				.from('organization_checkout_attempts')
				.select(ACTIVATION_CHECKOUT_ATTEMPT_COLUMNS)
				.in('commercial_plan', PAID_COMMERCIAL_PLANS)
				.in('organization_id', organizationIds)
				.order('created_at', { ascending: false })) as SupabaseResponse<ActivationCheckoutAttemptRow[]>;
			throwIfSupabaseError(checkoutResponse.error);
			for (const row of checkoutResponse.data ?? []) {
				const facts = factsByOrgId.get(row.organization_id);
				if (facts) applyCheckoutAttempt(facts, row);
			}

			const [
				activePersonnelCounts,
				memberCounts,
				statusTypeCounts,
				assignmentTypeCounts,
				dutyRosterTemplateCounts,
				dutyRosterRunCounts,
				dutyRosterHistoryCounts,
				onboardingTemplateStepCounts,
				trainingTypeCounts,
				ratingSchemeEntryCounts
			] = await Promise.all([
				countRowsByOrganization(supabase, 'personnel', organizationIds, { activePersonnelOnly: true }),
				countRowsByOrganization(supabase, 'organization_memberships', organizationIds),
				countRowsByOrganization(supabase, 'status_types', organizationIds),
				countRowsByOrganization(supabase, 'assignment_types', organizationIds),
				countRowsByOrganization(supabase, 'duty_roster_templates', organizationIds, {
					activeDutyRosterTemplatesOnly: true
				}),
				countRowsByOrganization(supabase, 'duty_roster_template_runs', organizationIds),
				countRowsByOrganization(supabase, 'duty_roster_history', organizationIds),
				countRowsByOrganization(supabase, 'onboarding_template_steps', organizationIds),
				countRowsByOrganization(supabase, 'training_types', organizationIds),
				countRowsByOrganization(supabase, 'rating_scheme_entries', organizationIds)
			]);

			applyCounts(factsByOrgId, activePersonnelCounts, 'activePersonnel');
			applyCounts(factsByOrgId, memberCounts, 'members');
			applyCounts(factsByOrgId, statusTypeCounts, 'statusTypes');
			applyCounts(factsByOrgId, assignmentTypeCounts, 'assignmentTypes');
			applyCounts(factsByOrgId, dutyRosterTemplateCounts, 'dutyRosterTemplates');
			applyCounts(factsByOrgId, dutyRosterRunCounts, 'dutyRosterRuns');
			applyCounts(factsByOrgId, dutyRosterHistoryCounts, 'dutyRosterHistory');
			applyCounts(factsByOrgId, onboardingTemplateStepCounts, 'onboardingTemplateSteps');
			applyCounts(factsByOrgId, trainingTypeCounts, 'trainingTypes');
			applyCounts(factsByOrgId, ratingSchemeEntryCounts, 'ratingSchemeEntries');

			return organizationIds.map((organizationId) => factsByOrgId.get(organizationId)!);
		}
	};
}

export function createSupabasePlatformActivationHealth(ctx: AdminContext): PlatformActivationHealth {
	return createPlatformActivationHealth({
		store: createSupabasePlatformActivationHealthStore(ctx.adminClient)
	});
}
