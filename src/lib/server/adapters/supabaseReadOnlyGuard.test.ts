import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseReadOnlyGuard } from './supabaseReadOnlyGuard';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

interface TestRow {
	[key: string]: unknown;
}

type TestTables = Record<string, TestRow[]>;
type Call = { method: string; args: unknown[] };

function compareRange(value: unknown, op: 'gte' | 'lte' | 'gt' | 'lt', expected: string): boolean {
	const actual = String(value ?? '');
	if (op === 'gte') return actual >= expected;
	if (op === 'lte') return actual <= expected;
	if (op === 'gt') return actual > expected;
	return actual < expected;
}

function createSupabaseMock(tables: TestTables) {
	return {
		from: vi.fn((table: string) => {
			const queryCalls: Call[] = [];

			const builder: Record<string, unknown> = {
				select: (...args: unknown[]) => {
					queryCalls.push({ method: 'select', args });
					return builder;
				},
				eq: (...args: unknown[]) => {
					queryCalls.push({ method: 'eq', args });
					return builder;
				},
				is: (...args: unknown[]) => {
					queryCalls.push({ method: 'is', args });
					return builder;
				},
				gte: (...args: unknown[]) => {
					queryCalls.push({ method: 'gte', args });
					return builder;
				},
				lte: (...args: unknown[]) => {
					queryCalls.push({ method: 'lte', args });
					return builder;
				},
				gt: (...args: unknown[]) => {
					queryCalls.push({ method: 'gt', args });
					return builder;
				},
				lt: (...args: unknown[]) => {
					queryCalls.push({ method: 'lt', args });
					return builder;
				},
				range: (...args: unknown[]) => {
					queryCalls.push({ method: 'range', args });
					return builder;
				},
				single: () => {
					const rows = applyQuery(tables[table] ?? [], queryCalls);
					if (!rows[0]) {
						return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
					}
					return Promise.resolve({ data: rows[0], error: null });
				},
				then: (
					resolve: (value: { data: TestRow[]; count: number; error: null }) => void,
					reject: (reason: unknown) => void
				) => {
					const rows = applyQuery(tables[table] ?? [], queryCalls);
					return Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve, reject);
				}
			};

			return builder;
		})
	};
}

function applyQuery(rows: TestRow[], calls: Call[]): TestRow[] {
	return rows.filter((row) => {
		for (const call of calls) {
			const [column, value] = call.args as [string, unknown];
			if (call.method === 'eq' && row[column] !== value) return false;
			if (call.method === 'is' && value === null && row[column] !== null) return false;
			if (['gte', 'lte', 'gt', 'lt'].includes(call.method)) {
				if (!compareRange(row[column], call.method as 'gte' | 'lte' | 'gt' | 'lt', String(value))) return false;
			}
		}
		return true;
	});
}

function baseTables(overrides: Partial<TestTables> = {}): TestTables {
	return {
		organizations: [
			{
				id: 'org-1',
				tier: 'free',
				stripe_customer_id: null,
				stripe_subscription_id: null,
				subscription_status: null,
				current_period_end: null,
				gift_tier: null,
				gift_expires_at: null
			}
		],
		organization_billing_snapshots: [],
		organization_plan_feature_overrides: [],
		personnel: [],
		organization_memberships: [],
		organization_invitations: [],
		data_exports: [],
		...overrides
	};
}

function billingSnapshot(overrides: Partial<TestRow> = {}): TestRow {
	return {
		organization_id: 'org-1',
		source: 'stripe',
		commercial_plan: 'free',
		stripe_customer_id: 'cus_123',
		stripe_subscription_id: 'sub_123',
		stripe_product_id: 'prod_free',
		stripe_price_id: 'price_free',
		subscription_status: 'active',
		collection_status: 'current',
		current_period_start: null,
		current_period_end: null,
		cancel_at_period_end: false,
		canceled_at: null,
		cancellation_reason: null,
		cancellation_feedback: null,
		trial_end: null,
		sync_status: 'synced',
		last_stripe_event_id: null,
		last_stripe_event_type: null,
		last_stripe_event_created_at: null,
		last_processed_at: null,
		last_reconciled_at: null,
		reconciliation_result: null,
		drift_detected: false,
		...overrides
	};
}

function personnel(count: number): TestRow[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `person-${index + 1}`,
		organization_id: 'org-1',
		archived_at: null
	}));
}

describe('SupabaseReadOnlyGuard', () => {
	beforeEach(() => {
		billingEnabledMock.mockReturnValue(true);
	});

	it('returns false when policy and usage do not put the Organization in Read-Only Mode', async () => {
		const guard = createSupabaseReadOnlyGuard(createSupabaseMock(baseTables()) as never, 'org-1');

		await expect(guard.check()).resolves.toBe(false);
	});

	it('surfaces billing-state Read-Only Mode for server-side mutation gates', async () => {
		const guard = createSupabaseReadOnlyGuard(
			createSupabaseMock(
				baseTables({
					organization_billing_snapshots: [
						billingSnapshot({
							subscription_status: 'past_due',
							collection_status: 'payment_failed_grace'
						})
					]
				})
			) as never,
			'org-1'
		);

		await expect(guard.checkState?.()).resolves.toEqual({
			isReadOnly: true,
			reason: 'payment_failure',
			message:
				'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
		});
	});

	it('surfaces active Personnel over-limit Read-Only Mode', async () => {
		const guard = createSupabaseReadOnlyGuard(
			createSupabaseMock(baseTables({ personnel: personnel(21) })) as never,
			'org-1'
		);

		await expect(guard.check()).resolves.toBe(true);
	});
});
