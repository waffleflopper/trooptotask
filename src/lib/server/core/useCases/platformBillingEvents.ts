import type Stripe from 'stripe';
import type {
	RecordedWebhookProcessingResult,
	WebhookProcessingState
} from '$lib/server/billing/stripeWebhookProcessing';

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

export interface PlatformBillingEventRetryMetadata {
	objectId?: string | null;
	secondaryDedupeKey?: string;
	eventCreatedAt?: string;
}

export type PlatformBillingEventRetryResult =
	| { ok: true; state: WebhookProcessingState; result: string }
	| { ok: false; status: number; error: string };

export interface PlatformBillingEventRetryProcessor {
	recordRetryAttempt(event: Stripe.Event, metadata: PlatformBillingEventRetryMetadata): Promise<number>;
	processRecordedEvent(
		event: Stripe.Event,
		metadata: PlatformBillingEventRetryMetadata
	): Promise<RecordedWebhookProcessingResult>;
}

export interface PlatformBillingEventRetryAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface PlatformBillingEvents {
	listDiagnostics(input: { limit: number }): Promise<{ events: BillingEventDiagnostic[]; diagnosticsError: boolean }>;
	getEventById(id: string): Promise<PlatformBillingEventRecord | null>;
	retryEvent(eventId: string): Promise<PlatformBillingEventRetryResult>;
}

export interface PlatformBillingEventsDependencies {
	store: PlatformBillingEventsStore;
	retryProcessor?: PlatformBillingEventRetryProcessor;
	audit?: (event: PlatformBillingEventRetryAuditEvent) => void;
}

function normalizeAttemptCount(value: number | null): number {
	return typeof value === 'number' ? value : 0;
}

function stripeEventFromLedgerRow(row: PlatformBillingEventRecord): Stripe.Event {
	const eventCreatedAt = row.eventCreatedAt ?? row.createdAt ?? new Date(0).toISOString();
	const createdSeconds = Math.floor(new Date(eventCreatedAt).getTime() / 1000);
	return {
		id: row.id,
		type: row.type,
		created: Number.isFinite(createdSeconds) ? createdSeconds : 0,
		data: row.data ?? { object: {} }
	} as Stripe.Event;
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
		},

		async retryEvent(eventId) {
			const trimmedEventId = eventId.trim();
			if (!trimmedEventId) return { ok: false, status: 400, error: 'Missing billing event ID.' };
			if (!deps.retryProcessor) {
				return { ok: false, status: 500, error: 'Billing event retry is not configured.' };
			}

			let eventRow: PlatformBillingEventRecord | null;
			try {
				eventRow = await deps.store.getEventById(trimmedEventId);
			} catch (err) {
				console.error('Admin billing event lookup failed:', { eventId: trimmedEventId, err });
				return { ok: false, status: 500, error: 'Failed to fetch billing event.' };
			}

			if (!eventRow) return { ok: false, status: 404, error: 'Billing event was not found.' };
			if (eventRow.processingState !== RETRYABLE_STATE || eventRow.processed === true) {
				return {
					ok: false,
					status: 400,
					error: `${eventRow.processingState ?? 'unknown'} billing events cannot be retried.`
				};
			}

			const event = stripeEventFromLedgerRow(eventRow);
			const eventCreatedAt = eventRow.eventCreatedAt ?? new Date(event.created * 1000).toISOString();
			const attemptCountBefore = normalizeAttemptCount(eventRow.attemptCount);

			try {
				await deps.retryProcessor.recordRetryAttempt(event, {
					objectId: eventRow.objectId,
					secondaryDedupeKey: eventRow.secondaryDedupeKey ?? undefined,
					eventCreatedAt
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to record billing event retry.';
				deps.audit?.({
					action: 'admin.billing_event.retry',
					resourceType: 'stripe_webhook_event',
					resourceId: eventRow.id,
					severity: 'warning',
					details: {
						eventType: eventRow.type,
						objectId: eventRow.objectId,
						processingStateBefore: eventRow.processingState,
						attemptCountBefore,
						resultState: 'ledger_error',
						result: message
					}
				});
				return {
					ok: false,
					status: message.includes('no longer retryable') ? 409 : 500,
					error: message
				};
			}

			let result: RecordedWebhookProcessingResult;
			try {
				result = await deps.retryProcessor.processRecordedEvent(event, {
					secondaryDedupeKey: eventRow.secondaryDedupeKey ?? undefined,
					eventCreatedAt
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to process billing event retry.';
				deps.audit?.({
					action: 'admin.billing_event.retry',
					resourceType: 'stripe_webhook_event',
					resourceId: eventRow.id,
					severity: 'warning',
					details: {
						eventType: eventRow.type,
						objectId: eventRow.objectId,
						processingStateBefore: eventRow.processingState,
						attemptCountBefore,
						resultState: 'processing_error',
						result: message
					}
				});
				return { ok: false, status: 500, error: message };
			}

			deps.audit?.({
				action: 'admin.billing_event.retry',
				resourceType: 'stripe_webhook_event',
				resourceId: eventRow.id,
				severity: result.ok ? 'info' : 'warning',
				details: {
					eventType: eventRow.type,
					objectId: eventRow.objectId,
					processingStateBefore: eventRow.processingState,
					attemptCountBefore,
					resultState: result.state,
					result: result.result
				}
			});

			if (!result.ok) {
				return { ok: false, status: result.status >= 400 ? result.status : 400, error: result.error ?? result.result };
			}

			return { ok: true, state: result.state, result: result.result };
		}
	};
}
