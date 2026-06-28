import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabasePlatformActivationHealthStore } from './supabasePlatformActivationHealth';

type Row = Record<string, unknown>;
type SupabaseCall = { table: string; method: string; args: unknown[] };
type SupabaseResponse<T> = { data: T | null; error: unknown };

class FakeQuery implements PromiseLike<SupabaseResponse<Row[]>> {
	private filters: Array<(row: Row) => boolean> = [];
	private limitCount: number | null = null;
	private orderSpecs: Array<{ column: string; ascending: boolean }> = [];

	constructor(
		private table: string,
		private rows: Row[],
		private calls: SupabaseCall[]
	) {}

	select(...args: unknown[]): this {
		this.calls.push({ table: this.table, method: 'select', args });
		return this;
	}

	eq(column: string, value: unknown): this {
		this.calls.push({ table: this.table, method: 'eq', args: [column, value] });
		this.filters.push((row) => row[column] === value);
		return this;
	}

	in(column: string, values: unknown[]): this {
		this.calls.push({ table: this.table, method: 'in', args: [column, values] });
		this.filters.push((row) => values.includes(row[column]));
		return this;
	}

	is(column: string, value: unknown): this {
		this.calls.push({ table: this.table, method: 'is', args: [column, value] });
		this.filters.push((row) => row[column] === value);
		return this;
	}

	order(column: string, options: { ascending?: boolean } = {}): this {
		this.calls.push({ table: this.table, method: 'order', args: [column, options] });
		this.orderSpecs.push({ column, ascending: options.ascending ?? true });
		return this;
	}

	limit(count: number): this {
		this.calls.push({ table: this.table, method: 'limit', args: [count] });
		this.limitCount = count;
		return this;
	}

	then<TResult1 = SupabaseResponse<Row[]>, TResult2 = never>(
		onfulfilled?: ((value: SupabaseResponse<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
	}

	private execute(): SupabaseResponse<Row[]> {
		let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
		for (const spec of [...this.orderSpecs].reverse()) {
			rows = [...rows].sort((left, right) => {
				const leftValue = String(left[spec.column] ?? '');
				const rightValue = String(right[spec.column] ?? '');
				return spec.ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
			});
		}
		if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
		return { data: rows, error: null };
	}
}

function createSupabaseStub(tables: Record<string, Row[]>): { supabase: SupabaseClient; calls: SupabaseCall[] } {
	const calls: SupabaseCall[] = [];
	const supabase = {
		from(table: string) {
			return new FakeQuery(table, tables[table] ?? [], calls);
		}
	} as unknown as SupabaseClient;

	return { supabase, calls };
}

describe('createSupabasePlatformActivationHealthStore', () => {
	it('maps activation facts from safe aggregate fields without selecting checkout URLs or provider IDs', async () => {
		const { supabase, calls } = createSupabaseStub({
			organization_billing_snapshots: [
				{
					organization_id: 'org-1',
					source: 'stripe',
					commercial_plan: 'team',
					subscription_status: 'active',
					collection_status: 'current',
					sync_status: 'synced',
					last_processed_at: '2026-06-02T00:00:00.000Z',
					updated_at: '2026-06-02T00:00:00.000Z',
					organizations: {
						id: 'org-1',
						name: 'Able Company',
						created_at: '2026-06-01T00:00:00.000Z'
					}
				},
				{
					organization_id: 'org-free',
					source: 'stripe',
					commercial_plan: 'free',
					subscription_status: 'active',
					collection_status: 'current',
					sync_status: 'synced',
					organizations: {
						id: 'org-free',
						name: 'Free Company',
						created_at: '2026-06-01T00:00:00.000Z'
					}
				}
			],
			organization_checkout_attempts: [
				{
					organization_id: 'org-1',
					commercial_plan: 'team',
					status: 'completed',
					created_at: '2026-06-01T00:05:00.000Z',
					updated_at: '2026-06-01T00:10:00.000Z',
					completed_at: '2026-06-01T00:10:00.000Z',
					canceled_at: null,
					expires_at: '2026-06-01T01:00:00.000Z',
					stripe_checkout_session_id: 'cs_secret_not_selected',
					checkout_url: 'https://checkout.test/secret',
					organizations: {
						id: 'org-1',
						name: 'Able Company',
						created_at: '2026-06-01T00:00:00.000Z'
					}
				},
				{
					organization_id: 'org-1',
					commercial_plan: 'team',
					status: 'failed',
					created_at: '2026-06-01T00:01:00.000Z',
					updated_at: '2026-06-01T00:02:00.000Z',
					completed_at: null,
					canceled_at: null,
					expires_at: '2026-06-01T01:00:00.000Z',
					organizations: {
						id: 'org-1',
						name: 'Able Company',
						created_at: '2026-06-01T00:00:00.000Z'
					}
				},
				{
					organization_id: 'org-2',
					commercial_plan: 'unit',
					status: 'in_progress',
					created_at: '2026-06-03T00:00:00.000Z',
					updated_at: '2026-06-03T00:00:00.000Z',
					completed_at: null,
					canceled_at: null,
					expires_at: '2026-06-03T01:00:00.000Z',
					organizations: {
						id: 'org-2',
						name: 'Bravo Company',
						created_at: '2026-06-03T00:00:00.000Z'
					}
				}
			],
			personnel: [
				{ organization_id: 'org-1', archived_at: null },
				{ organization_id: 'org-1', archived_at: null },
				{ organization_id: 'org-1', archived_at: '2026-06-05T00:00:00.000Z' },
				{ organization_id: 'org-2', archived_at: null }
			],
			organization_memberships: [
				{ organization_id: 'org-1' },
				{ organization_id: 'org-1' },
				{ organization_id: 'org-2' }
			],
			status_types: [{ organization_id: 'org-1' }],
			assignment_types: [{ organization_id: 'org-1' }],
			duty_roster_templates: [
				{ organization_id: 'org-1', status: 'active' },
				{ organization_id: 'org-1', status: 'archived' }
			],
			duty_roster_template_runs: [{ organization_id: 'org-1' }],
			duty_roster_history: [{ organization_id: 'org-1' }],
			onboarding_template_steps: [{ organization_id: 'org-1' }],
			training_types: [{ organization_id: 'org-1' }, { organization_id: 'org-1' }],
			rating_scheme_entries: [{ organization_id: 'org-1' }]
		});

		const facts = await createSupabasePlatformActivationHealthStore(supabase).listActivationOrganizationFacts({
			limit: 10
		});

		expect(facts).toHaveLength(2);
		expect(facts[0]).toMatchObject({
			organizationId: 'org-1',
			organizationName: 'Able Company',
			organizationCreatedAt: '2026-06-01T00:00:00.000Z',
			billing: {
				source: 'stripe',
				commercialPlan: 'team',
				subscriptionStatus: 'active',
				collectionStatus: 'current',
				syncStatus: 'synced'
			},
			checkout: {
				attemptCount: 2,
				completedCount: 1,
				interruptedCount: 1,
				inProgressCount: 0,
				latestStatus: 'completed',
				latestAt: '2026-06-01T00:10:00.000Z'
			},
			counts: {
				activePersonnel: 2,
				members: 2,
				statusTypes: 1,
				assignmentTypes: 1,
				dutyRosterTemplates: 1,
				dutyRosterRuns: 1,
				dutyRosterHistory: 1,
				onboardingTemplateSteps: 1,
				trainingTypes: 2,
				ratingSchemeEntries: 1
			}
		});
		expect(facts[1]).toMatchObject({
			organizationId: 'org-2',
			organizationName: 'Bravo Company',
			billing: null,
			checkout: {
				attemptCount: 1,
				completedCount: 0,
				inProgressCount: 1,
				latestStatus: 'in_progress'
			}
		});

		const checkoutSelect = calls.find(
			(call) => call.table === 'organization_checkout_attempts' && call.method === 'select'
		);
		expect(String(checkoutSelect?.args[0])).not.toContain('checkout_url');
		expect(String(checkoutSelect?.args[0])).not.toContain('stripe_checkout_session_id');

		const billingSelect = calls.find(
			(call) => call.table === 'organization_billing_snapshots' && call.method === 'select'
		);
		expect(String(billingSelect?.args[0])).not.toContain('stripe_customer_id');
		expect(String(billingSelect?.args[0])).not.toContain('stripe_subscription_id');
	});
});
