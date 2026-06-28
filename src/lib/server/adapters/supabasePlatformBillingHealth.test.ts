import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformBillingHealthStore } from './supabasePlatformBillingHealth';

type TestRow = Record<string, unknown>;
type QueryResult = { data: TestRow[] | null; error: unknown };

interface QueryInspection {
	table: string;
	selectColumns: string | null;
	eqFilters: Array<{ column: string; value: unknown }>;
	inFilters: Array<{ column: string; values: unknown[] }>;
	orFilters: string[];
	orders: Array<{ column: string; options?: { ascending?: boolean; nullsFirst?: boolean } }>;
	limitValue: number | null;
}

interface QueryStub extends PromiseLike<QueryResult> {
	select: ReturnType<typeof vi.fn>;
	eq: ReturnType<typeof vi.fn>;
	in: ReturnType<typeof vi.fn>;
	or: ReturnType<typeof vi.fn>;
	order: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
}

function splitOrPredicates(predicate: string): string[] {
	const predicates: string[] = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index < predicate.length; index += 1) {
		const char = predicate[index];
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (char === ',' && depth === 0) {
			predicates.push(predicate.slice(start, index));
			start = index + 1;
		}
	}
	predicates.push(predicate.slice(start));
	return predicates.filter(Boolean);
}

function coerceFilterValue(value: string): unknown {
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null') return null;
	return value;
}

function matchesPredicate(row: TestRow, predicate: string): boolean {
	const inMatch = predicate.match(/^(.+)\.in\.\((.*)\)$/);
	if (inMatch) {
		const [, column, rawValues] = inMatch;
		const values = rawValues.split(',').map(coerceFilterValue);
		return values.includes(row[column]);
	}

	if (predicate.endsWith('.is.null')) {
		const column = predicate.slice(0, -'.is.null'.length);
		return row[column] === null || row[column] === undefined;
	}

	const eqParts = predicate.split('.eq.');
	if (eqParts.length === 2) return row[eqParts[0]] === coerceFilterValue(eqParts[1]);

	const ltParts = predicate.split('.lt.');
	if (ltParts.length === 2) {
		const value = row[ltParts[0]];
		return typeof value === 'string' && value < ltParts[1];
	}

	throw new Error(`Unsupported test predicate: ${predicate}`);
}

function applyFilters(rows: TestRow[], inspection: QueryInspection): TestRow[] {
	return rows.filter((row) => {
		const eqMatches = inspection.eqFilters.every((filter) => row[filter.column] === filter.value);
		const inMatches = inspection.inFilters.every((filter) => filter.values.includes(row[filter.column]));
		const orMatches = inspection.orFilters.every((filter) =>
			splitOrPredicates(filter).some((predicate) => matchesPredicate(row, predicate))
		);
		return eqMatches && inMatches && orMatches;
	});
}

function compareValues(
	left: unknown,
	right: unknown,
	options: { ascending?: boolean; nullsFirst?: boolean } | undefined
): number {
	const ascending = options?.ascending ?? true;
	const nullsFirst = options?.nullsFirst ?? false;
	if (left == null && right == null) return 0;
	if (left == null) return nullsFirst ? -1 : 1;
	if (right == null) return nullsFirst ? 1 : -1;
	if (left === right) return 0;
	const comparison = String(left) < String(right) ? -1 : 1;
	return ascending ? comparison : -comparison;
}

function orderRows(rows: TestRow[], inspection: QueryInspection): TestRow[] {
	return [...rows].sort((left, right) => {
		for (const order of inspection.orders) {
			const comparison = compareValues(left[order.column], right[order.column], order.options);
			if (comparison !== 0) return comparison;
		}
		return 0;
	});
}

function createSupabaseStub(tables: Record<string, TestRow[]>, error: unknown = null) {
	const queries: QueryInspection[] = [];
	const from = vi.fn((table: string) => {
		const inspection: QueryInspection = {
			table,
			selectColumns: null,
			eqFilters: [],
			inFilters: [],
			orFilters: [],
			orders: [],
			limitValue: null
		};
		const query = {} as QueryStub;
		const resolveRows = (limitValue: number | null = null): QueryResult => {
			if (error) return { data: null, error };
			const rows = orderRows(applyFilters(tables[table] ?? [], inspection), inspection);
			return { data: limitValue === null ? rows : rows.slice(0, limitValue), error: null };
		};
		query.select = vi.fn((columns: string) => {
			inspection.selectColumns = columns;
			return query;
		});
		query.eq = vi.fn((column: string, value: unknown) => {
			inspection.eqFilters.push({ column, value });
			return query;
		});
		query.in = vi.fn((column: string, values: unknown[]) => {
			inspection.inFilters.push({ column, values });
			return query;
		});
		query.or = vi.fn((predicate: string) => {
			inspection.orFilters.push(predicate);
			return query;
		});
		query.order = vi.fn((column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => {
			inspection.orders.push({ column, options });
			return query;
		});
		query.limit = vi.fn(async (limitValue: number) => {
			inspection.limitValue = limitValue;
			return resolveRows(limitValue);
		});
		query.then = (onfulfilled, onrejected) => Promise.resolve(resolveRows()).then(onfulfilled, onrejected);
		queries.push(inspection);
		return query;
	});

	return {
		supabase: { from },
		from,
		queries
	};
}

function eventRow(overrides: TestRow = {}): TestRow {
	return {
		id: 'evt_1',
		type: 'checkout.session.completed',
		object_id: 'cs_123',
		event_created_at: '2026-06-24T00:00:00.000Z',
		processing_state: 'processed',
		attempt_count: 1,
		processing_result: 'processed',
		created_at: '2026-06-24T00:00:01.000Z',
		updated_at: '2026-06-24T00:00:02.000Z',
		data: { object: { secret: 'raw payload should not be selected' } },
		last_error: 'sk_test_secret should not be selected',
		...overrides
	};
}

function snapshotRow(overrides: TestRow = {}): TestRow {
	return {
		organization_id: 'org-1',
		source: 'stripe',
		commercial_plan: 'team',
		stripe_customer_id: 'cus_123',
		stripe_subscription_id: 'sub_123',
		stripe_product_id: 'prod_team',
		stripe_price_id: 'price_team',
		subscription_status: 'active',
		collection_status: 'current',
		current_period_start: '2026-06-01T00:00:00.000Z',
		current_period_end: '2026-07-01T00:00:00.000Z',
		cancel_at_period_end: false,
		canceled_at: null,
		cancellation_reason: null,
		cancellation_feedback: null,
		trial_end: null,
		sync_status: 'synced',
		last_stripe_event_id: 'evt_snapshot',
		last_stripe_event_type: 'customer.subscription.updated',
		last_stripe_event_created_at: '2026-06-23T00:00:00.000Z',
		last_processed_at: '2026-06-23T00:01:00.000Z',
		last_reconciled_at: '2026-06-24T00:00:00.000Z',
		reconciliation_result: 'matched',
		drift_detected: false,
		organizations: { id: 'org-1', name: 'Alpha Company' },
		...overrides
	};
}

describe('createSupabasePlatformBillingHealthStore', () => {
	it('lists failed webhook health events before limiting successful recent events', async () => {
		const stub = createSupabaseStub({
			stripe_webhook_events: [
				eventRow({ id: 'evt_processed_recent', event_created_at: '2026-06-24T12:00:00.000Z' }),
				eventRow({ id: 'evt_processed_next', event_created_at: '2026-06-24T11:00:00.000Z' }),
				eventRow({
					id: 'evt_permanent_old',
					event_created_at: '2026-06-22T00:00:00.000Z',
					processing_state: 'permanently_failed',
					processing_result: 'permanent processing failure'
				}),
				eventRow({
					id: 'evt_retry_older',
					event_created_at: '2026-06-21T00:00:00.000Z',
					processing_state: 'retryable_failed',
					processing_result: 'retryable processing failure'
				})
			]
		});

		const result = await createSupabasePlatformBillingHealthStore(stub.supabase as never).listRecentHealthEvents(2);

		expect(result.map((event) => event.id)).toEqual(['evt_permanent_old', 'evt_retry_older']);
		expect(result.every((event) => event.processingState === 'processed')).toBe(false);
		const eventQuery = stub.queries.find((query) => query.table === 'stripe_webhook_events');
		expect(eventQuery?.selectColumns).not.toContain('data');
		expect(eventQuery?.selectColumns).not.toContain('last_error');
		expect(eventQuery?.inFilters).toEqual(
			expect.arrayContaining([{ column: 'processing_state', values: ['retryable_failed', 'permanently_failed'] }])
		);
	});

	it('attaches safe linked billing context to failed webhook events', async () => {
		const stub = createSupabaseStub({
			stripe_webhook_events: [
				eventRow({
					id: 'evt_retry_linked',
					object_id: 'sub_123',
					processing_state: 'retryable_failed',
					processing_result: 'retryable processing failure'
				})
			],
			organization_billing_snapshots: [
				snapshotRow({
					organization_id: 'org-linked',
					organizations: { id: 'org-linked', name: 'Linked Company' },
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: 'sub_123',
					last_stripe_event_id: 'evt_other',
					subscription_status: 'past_due',
					collection_status: 'payment_failed_grace',
					sync_status: 'synced',
					drift_detected: false
				})
			]
		});

		const result = await createSupabasePlatformBillingHealthStore(stub.supabase as never).listRecentHealthEvents(10);

		expect(result).toEqual([
			expect.objectContaining({
				id: 'evt_retry_linked',
				linkedBillingContext: {
					organizationId: 'org-linked',
					organizationName: 'Linked Company',
					stripeCustomerId: 'cus_123',
					stripeSubscriptionId: 'sub_123',
					billingState: {
						source: 'stripe',
						commercialPlan: 'team',
						subscriptionStatus: 'past_due',
						collectionStatus: 'payment_failed_grace',
						syncStatus: 'synced',
						driftDetected: false
					}
				}
			})
		]);
		expect(JSON.stringify(result)).not.toContain('raw payload should not be selected');
		expect(JSON.stringify(result)).not.toContain('sk_test_secret');
	});

	it('links every capped failed event when the matching snapshot set is larger than the event cap', async () => {
		const stub = createSupabaseStub({
			stripe_webhook_events: [
				eventRow({
					id: 'evt_retry_newer',
					object_id: 'sub_newer',
					event_created_at: '2026-06-24T02:00:00.000Z',
					processing_state: 'retryable_failed',
					processing_result: 'retryable processing failure'
				}),
				eventRow({
					id: 'evt_retry_older',
					object_id: 'sub_older',
					event_created_at: '2026-06-24T01:00:00.000Z',
					processing_state: 'retryable_failed',
					processing_result: 'retryable processing failure'
				})
			],
			organization_billing_snapshots: [
				snapshotRow({
					organization_id: 'org-newer-primary',
					organizations: { id: 'org-newer-primary', name: 'Newer Primary' },
					stripe_subscription_id: 'sub_newer',
					last_processed_at: '2026-06-24T03:00:00.000Z'
				}),
				snapshotRow({
					organization_id: 'org-newer-secondary',
					organizations: { id: 'org-newer-secondary', name: 'Newer Secondary' },
					stripe_subscription_id: 'sub_newer',
					last_processed_at: '2026-06-24T02:30:00.000Z'
				}),
				snapshotRow({
					organization_id: 'org-older',
					organizations: { id: 'org-older', name: 'Older Company' },
					stripe_subscription_id: 'sub_older',
					last_processed_at: '2026-06-24T01:30:00.000Z'
				})
			]
		});

		const result = await createSupabasePlatformBillingHealthStore(stub.supabase as never).listRecentHealthEvents(2);

		expect(result.map((event) => event.id)).toEqual(['evt_retry_newer', 'evt_retry_older']);
		expect(result.find((event) => event.id === 'evt_retry_newer')?.linkedBillingContext?.organizationId).toBe(
			'org-newer-primary'
		);
		expect(result.find((event) => event.id === 'evt_retry_older')?.linkedBillingContext?.organizationId).toBe(
			'org-older'
		);
	});

	it('omits unsafe stored provider IDs from billing context link filters', async () => {
		const stub = createSupabaseStub({
			stripe_webhook_events: [
				eventRow({
					id: 'evt_safe',
					object_id: 'sub_safe',
					processing_state: 'retryable_failed',
					processing_result: 'retryable processing failure'
				}),
				eventRow({
					id: 'evt_bad),stripe_customer_id.eq.cus_attack',
					object_id: 'sub_bad),stripe_customer_id.eq.cus_attack',
					processing_state: 'retryable_failed',
					processing_result: 'retryable processing failure'
				})
			],
			organization_billing_snapshots: [
				snapshotRow({
					organization_id: 'org-safe',
					organizations: { id: 'org-safe', name: 'Safe Company' },
					stripe_subscription_id: 'sub_safe'
				})
			]
		});

		const result = await createSupabasePlatformBillingHealthStore(stub.supabase as never).listRecentHealthEvents(10);
		const snapshotQuery = stub.queries.find((query) => query.table === 'organization_billing_snapshots');

		expect(snapshotQuery?.orFilters.join(',')).toContain('evt_safe');
		expect(snapshotQuery?.orFilters.join(',')).toContain('sub_safe');
		expect(snapshotQuery?.orFilters.join(',')).not.toContain('cus_attack');
		expect(result.find((event) => event.id === 'evt_safe')?.linkedBillingContext?.organizationId).toBe('org-safe');
		expect(result.find((event) => event.id.startsWith('evt_bad'))?.linkedBillingContext).toBeUndefined();
	});

	it('prioritizes drift and payment recovery snapshots before stale reconciliation rows', async () => {
		const stub = createSupabaseStub({
			organization_billing_snapshots: [
				snapshotRow({
					organization_id: 'org-stale-1',
					last_reconciled_at: '2026-06-19T00:00:00.000Z',
					organizations: { id: 'org-stale-1', name: 'Stale One' }
				}),
				snapshotRow({
					organization_id: 'org-stale-2',
					commercial_plan: 'unit',
					last_reconciled_at: null,
					organizations: { id: 'org-stale-2', name: 'Stale Two' }
				}),
				snapshotRow({
					organization_id: 'org-legacy-review',
					source: 'legacy_organization',
					commercial_plan: 'team',
					sync_status: 'needs_reconciliation',
					last_processed_at: '2026-06-24T00:00:00.000Z',
					last_reconciled_at: '2026-06-24T00:00:00.000Z',
					organizations: { id: 'org-legacy-review', name: 'Legacy Review' }
				}),
				snapshotRow({
					organization_id: 'org-terminal-free',
					source: 'stripe',
					commercial_plan: 'free',
					subscription_status: 'unpaid',
					collection_status: 'payment_failed_terminal',
					last_processed_at: '2026-06-23T00:00:00.000Z',
					last_reconciled_at: '2026-06-24T00:00:00.000Z',
					organizations: { id: 'org-terminal-free', name: 'Terminal Free' }
				})
			]
		});

		const result = await createSupabasePlatformBillingHealthStore(stub.supabase as never).listBillingSnapshotsForHealth(
			{
				limit: 2,
				staleReconciledBefore: '2026-06-21T00:00:00.000Z'
			}
		);

		expect(result.map((snapshot) => snapshot.organizationId)).toEqual(['org-legacy-review', 'org-terminal-free']);
		expect(result[0]).toMatchObject({
			source: 'legacy_organization',
			syncStatus: 'needs_reconciliation'
		});
		expect(result[1]).toMatchObject({
			commercialPlan: 'free',
			subscriptionStatus: 'unpaid',
			collectionStatus: 'payment_failed_terminal'
		});
	});

	it('limits stale reconciliation health snapshots to paid Stripe snapshots', async () => {
		const stub = createSupabaseStub({
			organization_billing_snapshots: [
				snapshotRow({
					organization_id: 'org-paid-null',
					last_reconciled_at: null,
					organizations: { id: 'org-paid-null', name: 'Paid Null' }
				}),
				snapshotRow({
					organization_id: 'org-paid-old',
					commercial_plan: 'unit',
					last_reconciled_at: '2026-06-19T00:00:00.000Z',
					organizations: { id: 'org-paid-old', name: 'Paid Old' }
				}),
				snapshotRow({
					organization_id: 'org-free-stale',
					commercial_plan: 'free',
					last_reconciled_at: null,
					organizations: { id: 'org-free-stale', name: 'Free Stale' }
				}),
				snapshotRow({
					organization_id: 'org-legacy-stale',
					source: 'legacy_organization',
					commercial_plan: 'team',
					last_reconciled_at: null,
					organizations: { id: 'org-legacy-stale', name: 'Legacy Stale' }
				})
			]
		});

		const result = await createSupabasePlatformBillingHealthStore(stub.supabase as never).listBillingSnapshotsForHealth(
			{
				limit: 10,
				staleReconciledBefore: '2026-06-21T00:00:00.000Z'
			}
		);

		expect(result.map((snapshot) => snapshot.organizationId)).toEqual(['org-paid-null', 'org-paid-old']);
	});

	it('dedupes snapshots returned by multiple health buckets', async () => {
		const stub = createSupabaseStub({
			organization_billing_snapshots: [
				snapshotRow({
					organization_id: 'org-mixed',
					sync_status: 'needs_reconciliation',
					subscription_status: 'past_due',
					collection_status: 'payment_failed_grace',
					last_reconciled_at: null,
					organizations: { id: 'org-mixed', name: 'Mixed Company' }
				})
			]
		});

		const result = await createSupabasePlatformBillingHealthStore(stub.supabase as never).listBillingSnapshotsForHealth(
			{
				limit: 10,
				staleReconciledBefore: '2026-06-21T00:00:00.000Z'
			}
		);

		expect(result.map((snapshot) => snapshot.organizationId)).toEqual(['org-mixed']);
	});
});
