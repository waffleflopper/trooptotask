import type {
	PlatformBillingEventsStore,
	PlatformBillingEventRecord,
	PlatformBillingOrganizationLink,
	PlatformBillingSnapshotLink
} from '$lib/server/core/useCases/platformBillingEvents';

interface InMemoryPlatformBillingEventsSeed {
	events?: PlatformBillingEventRecord[];
	snapshots?: PlatformBillingSnapshotLink[];
	organizations?: PlatformBillingOrganizationLink[];
}

function cloneEvent(event: PlatformBillingEventRecord): PlatformBillingEventRecord {
	return { ...event };
}

function compareNullableIsoDesc(left: string | null, right: string | null): number {
	if (left && right) return right.localeCompare(left);
	if (left) return -1;
	if (right) return 1;
	return 0;
}

export function createInMemoryPlatformBillingEventsStore(
	seed: InMemoryPlatformBillingEventsSeed = {}
): PlatformBillingEventsStore {
	const events = new Map((seed.events ?? []).map((event) => [event.id, cloneEvent(event)]));
	const snapshots = (seed.snapshots ?? []).map((snapshot) => ({ ...snapshot }));
	const organizations = new Map((seed.organizations ?? []).map((org) => [org.id, { ...org }]));

	return {
		async listRecentEvents(limit) {
			return Array.from(events.values())
				.sort((a, b) => {
					const eventCreatedAtComparison = compareNullableIsoDesc(a.eventCreatedAt, b.eventCreatedAt);
					if (eventCreatedAtComparison !== 0) return eventCreatedAtComparison;
					return compareNullableIsoDesc(a.createdAt, b.createdAt);
				})
				.slice(0, limit)
				.map(cloneEvent);
		},

		async getEventById(id) {
			const event = events.get(id);
			return event ? cloneEvent(event) : null;
		},

		async listSnapshotsForEvents(input) {
			const eventIds = new Set(input.eventIds);
			const objectIds = new Set(input.objectIds);
			return snapshots
				.filter(
					(snapshot) =>
						(snapshot.lastStripeEventId ? eventIds.has(snapshot.lastStripeEventId) : false) ||
						(snapshot.stripeSubscriptionId ? objectIds.has(snapshot.stripeSubscriptionId) : false) ||
						(snapshot.stripeCustomerId ? objectIds.has(snapshot.stripeCustomerId) : false)
				)
				.map((snapshot) => ({ ...snapshot }));
		},

		async listOrganizationsById(ids) {
			return ids.flatMap((id) => {
				const organization = organizations.get(id);
				return organization ? [{ ...organization }] : [];
			});
		}
	};
}
