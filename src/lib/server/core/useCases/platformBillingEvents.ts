import type Stripe from 'stripe';
import type { WebhookProcessingState } from '$lib/server/billing/stripeWebhookProcessing';

const RETRYABLE_STATE: WebhookProcessingState = 'retryable_failed';

export interface PlatformBillingEventRecord {
	id: string;
	type: string;
	objectId: string | null;
	secondaryDedupeKey: string | null;
	eventCreatedAt: string | null;
	processed: boolean | null;
	processedAt: string | null;
	processingState: WebhookProcessingState | null;
	attemptCount: number | null;
	lastError: string | null;
	processingResult: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	data?: Stripe.Event.Data | null;
}

export interface PlatformBillingSnapshotLink {
	organizationId: string;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	lastStripeEventId: string | null;
}

export interface PlatformBillingOrganizationLink {
	id: string;
	name: string;
}

export type BillingEventDiagnostic = {
	id: string;
	type: string;
	objectId: string | null;
	secondaryDedupeKey: string | null;
	eventCreatedAt: string | null;
	processed: boolean;
	processedAt: string | null;
	processingState: WebhookProcessingState | null;
	attemptCount: number;
	lastError: string | null;
	processingResult: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	canRetry: boolean;
	organization: { id: string; name: string | null } | null;
};

export interface PlatformBillingEventSnapshotLookup {
	eventIds: string[];
	objectIds: string[];
}

export interface PlatformBillingEventsStore {
	listRecentEvents(limit: number): Promise<PlatformBillingEventRecord[]>;
	getEventById(id: string): Promise<PlatformBillingEventRecord | null>;
	listSnapshotsForEvents(input: PlatformBillingEventSnapshotLookup): Promise<PlatformBillingSnapshotLink[]>;
	listOrganizationsById(ids: string[]): Promise<PlatformBillingOrganizationLink[]>;
}

export interface PlatformBillingEvents {
	listDiagnostics(input: { limit: number }): Promise<{ events: BillingEventDiagnostic[]; diagnosticsError: boolean }>;
	getEventById(id: string): Promise<PlatformBillingEventRecord | null>;
}

export interface PlatformBillingEventsDependencies {
	store: PlatformBillingEventsStore;
}

function normalizeAttemptCount(value: number | null): number {
	return typeof value === 'number' ? value : 0;
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => !!value))];
}

export function mapBillingEventDiagnostics(
	events: PlatformBillingEventRecord[],
	snapshots: PlatformBillingSnapshotLink[],
	organizations: PlatformBillingOrganizationLink[]
): BillingEventDiagnostic[] {
	const organizationNameById = new Map(organizations.map((org) => [org.id, org.name]));
	const snapshotByEventId = new Map<string, PlatformBillingSnapshotLink>();
	const snapshotByStripeObjectId = new Map<string, PlatformBillingSnapshotLink>();

	for (const snapshot of snapshots) {
		if (snapshot.lastStripeEventId) snapshotByEventId.set(snapshot.lastStripeEventId, snapshot);
		if (snapshot.stripeSubscriptionId) snapshotByStripeObjectId.set(snapshot.stripeSubscriptionId, snapshot);
		if (snapshot.stripeCustomerId) snapshotByStripeObjectId.set(snapshot.stripeCustomerId, snapshot);
	}

	return events.map((event) => {
		const snapshot =
			snapshotByEventId.get(event.id) ?? (event.objectId ? snapshotByStripeObjectId.get(event.objectId) : undefined);
		const organization = snapshot
			? {
					id: snapshot.organizationId,
					name: organizationNameById.get(snapshot.organizationId) ?? null
				}
			: null;

		return {
			id: event.id,
			type: event.type,
			objectId: event.objectId,
			secondaryDedupeKey: event.secondaryDedupeKey,
			eventCreatedAt: event.eventCreatedAt,
			processed: event.processed === true,
			processedAt: event.processedAt,
			processingState: event.processingState,
			attemptCount: normalizeAttemptCount(event.attemptCount),
			lastError: event.lastError,
			processingResult: event.processingResult,
			createdAt: event.createdAt,
			updatedAt: event.updatedAt,
			canRetry: event.processingState === RETRYABLE_STATE,
			organization
		};
	});
}

export function createPlatformBillingEvents(deps: PlatformBillingEventsDependencies): PlatformBillingEvents {
	return {
		async listDiagnostics(input) {
			let events: PlatformBillingEventRecord[];
			try {
				events = await deps.store.listRecentEvents(input.limit);
			} catch (error) {
				console.error('Admin billing events query failed:', error);
				return { events: [], diagnosticsError: true };
			}

			if (events.length === 0) return { events: [], diagnosticsError: false };

			let snapshots: PlatformBillingSnapshotLink[];
			try {
				snapshots = await deps.store.listSnapshotsForEvents({
					eventIds: events.map((event) => event.id),
					objectIds: uniqueValues(events.map((event) => event.objectId))
				});
			} catch (error) {
				console.error('Admin billing event snapshot-link query failed:', error);
				return { events: mapBillingEventDiagnostics(events, [], []), diagnosticsError: true };
			}

			try {
				const organizations = await deps.store.listOrganizationsById(
					uniqueValues(snapshots.map((snapshot) => snapshot.organizationId))
				);
				return { events: mapBillingEventDiagnostics(events, snapshots, organizations), diagnosticsError: false };
			} catch (error) {
				console.error('Admin billing event organization-link query failed:', error);
				return { events: mapBillingEventDiagnostics(events, snapshots, []), diagnosticsError: true };
			}
		},

		getEventById(id) {
			return deps.store.getEventById(id);
		}
	};
}
