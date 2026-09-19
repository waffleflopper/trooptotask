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
});
