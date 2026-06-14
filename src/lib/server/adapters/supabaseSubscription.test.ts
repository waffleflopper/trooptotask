import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseSubscriptionAdapter } from './supabaseSubscription';

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
	const calls: Array<{ table: string; calls: Call[] }> = [];

	const supabase = {
		from: vi.fn((table: string) => {
			const queryCalls: Call[] = [];
			calls.push({ table, calls: queryCalls });

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

	return { supabase, calls };
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

function organization(overrides: Partial<TestRow> = {}): TestRow {
	return {
		id: 'org-1',
		tier: 'free',
		stripe_customer_id: null,
		stripe_subscription_id: null,
		subscription_status: null,
		current_period_end: null,
		gift_tier: null,
		gift_expires_at: null,
		...overrides
	};
}

function billingSnapshot(overrides: Partial<TestRow> = {}): TestRow {
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
		current_period_start: null,
		current_period_end: null,
		cancel_at_period_end: false,
		canceled_at: null,
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

function personnel(count: number, orgId = 'org-1'): TestRow[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `person-${index + 1}`,
		organization_id: orgId,
		archived_at: null
	}));
}

function baseTables(overrides: Partial<TestTables> = {}): TestTables {
	return {
		organizations: [organization()],
		organization_billing_snapshots: [],
		personnel: [],
		organization_memberships: [],
		organization_invitations: [],
		data_exports: [],
		...overrides
	};
}

describe('createSupabaseSubscriptionAdapter', () => {
	beforeEach(() => {
		billingEnabledMock.mockReturnValue(true);
	});

	it('denies personnel creation at the plan-policy cap', async () => {
		const { supabase } = createSupabaseMock(baseTables({ personnel: personnel(20) }));
		const adapter = createSupabaseSubscriptionAdapter(supabase as never, 'org-1');

		await expect(adapter.canAddPersonnel()).resolves.toEqual({
			allowed: false,
			message: 'Personnel limit reached. Upgrade or archive personnel to add more.'
		});
	});

	it('allows personnel creation when a paid policy has headroom', async () => {
		const { supabase } = createSupabaseMock(
			baseTables({
				organizations: [organization({ tier: 'team' })],
				personnel: personnel(20)
			})
		);
		const adapter = createSupabaseSubscriptionAdapter(supabase as never, 'org-1');

		await expect(adapter.canAddPersonnel()).resolves.toEqual({ allowed: true });
	});

	it('returns available personnel slots from plan policy and usage reads', async () => {
		const { supabase } = createSupabaseMock(
			baseTables({
				organizations: [organization({ tier: 'team' })],
				personnel: personnel(78)
			})
		);
		const adapter = createSupabaseSubscriptionAdapter(supabase as never, 'org-1');

		await expect(adapter.getAvailablePersonnelSlots()).resolves.toBe(2);
	});

	it('returns billing-disabled unlimited compatibility tier', async () => {
		billingEnabledMock.mockReturnValue(false);
		const { supabase } = createSupabaseMock(baseTables());
		const adapter = createSupabaseSubscriptionAdapter(supabase as never, 'org-1');

		await expect(adapter.getEffectiveTier()).resolves.toMatchObject({
			tier: 'unit',
			source: 'billing_disabled',
			personnelCap: Infinity,
			isReadOnly: false,
			readOnlyReason: null
		});
		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(supabase.from).toHaveBeenCalledWith('organization_plan_feature_overrides');
	});

	it('allows personnel creation and returns null slots when billing is disabled', async () => {
		billingEnabledMock.mockReturnValue(false);
		const { supabase } = createSupabaseMock(baseTables({ personnel: personnel(25) }));
		const adapter = createSupabaseSubscriptionAdapter(supabase as never, 'org-1');

		await expect(adapter.canAddPersonnel()).resolves.toEqual({ allowed: true });
		await expect(adapter.getAvailablePersonnelSlots()).resolves.toBeNull();
		expect(supabase.from).toHaveBeenCalledTimes(2);
		expect(supabase.from).toHaveBeenNthCalledWith(1, 'organization_plan_feature_overrides');
		expect(supabase.from).toHaveBeenNthCalledWith(2, 'organization_plan_feature_overrides');
	});

	it('denies personnel creation for billing-state read-only organizations', async () => {
		const { supabase } = createSupabaseMock(
			baseTables({
				organization_billing_snapshots: [
					billingSnapshot({
						subscription_status: 'canceled',
						collection_status: 'canceled'
					})
				],
				personnel: personnel(12)
			})
		);
		const adapter = createSupabaseSubscriptionAdapter(supabase as never, 'org-1');

		await expect(adapter.canAddPersonnel()).resolves.toEqual({
			allowed: false,
			message: 'Organization billing is not currently active. Restore the subscription to regain paid write access.'
		});
	});
});
