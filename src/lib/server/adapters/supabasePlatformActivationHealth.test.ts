import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabasePlatformActivationHealthStore } from './supabasePlatformActivationHealth';

type Row = Record<string, unknown>;
type SupabaseCall = { table: string; method: string; args: unknown[] };
type SupabaseResponse<T> = { data: T | null; error: unknown };

const EXPECTED_ORGANIZATION_SELECT = 'id, name, created_at';
const EXPECTED_CHECKOUT_SELECT =
	'organization_id, status, commercial_plan, created_at, updated_at, completed_at, canceled_at, expires_at, organizations!inner(id, name, created_at)';
const EXPECTED_BILLING_SELECT =
	'organization_id, source, commercial_plan, subscription_status, collection_status, sync_status, organizations!inner(id, name, created_at)';

class FakeQuery implements PromiseLike<SupabaseResponse<Row[]>> {
	private filters: Array<(row: Row) => boolean> = [];
	private limitCount: number | null = null;
	private orderSpecs: Array<{ column: string; ascending: boolean }> = [];
	private rangeStart: number | null = null;
	private rangeEnd: number | null = null;

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

	range(from: number, to: number): this {
		this.calls.push({ table: this.table, method: 'range', args: [from, to] });
		this.rangeStart = from;
		this.rangeEnd = to;
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
		if (this.rangeStart !== null && this.rangeEnd !== null) rows = rows.slice(this.rangeStart, this.rangeEnd + 1);
		else if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
		return { data: rows, error: null };
	}
}

function createSupabaseStub(tables: Record<string, Row[]>): { supabase: SupabaseClient; calls: SupabaseCall[] } {
	const calls: SupabaseCall[] = [];
	function countRowsByOrganization(rows: Row[], organizationIds: unknown[], countField: string): Row[] {
		const counts = new Map<unknown, number>();
		for (const row of rows) {
			if (!organizationIds.includes(row.organization_id)) continue;
			if (countField === 'personnel_count' && row.archived_at !== null) continue;
			counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
		}
		return [...counts].map(([organization_id, count]) => ({
			organization_id,
			[countField]: count
		}));
	}

	const supabase = {
		rpc(name: string, params?: unknown) {
			calls.push({ table: 'rpc', method: name, args: [params] });
			const organizationIds = Array.isArray((params as { p_org_ids?: unknown[] } | undefined)?.p_org_ids)
				? ((params as { p_org_ids: unknown[] }).p_org_ids ?? [])
				: [];
			if (name === 'count_personnel_by_organization') {
				return Promise.resolve({
					data: countRowsByOrganization(tables.personnel ?? [], organizationIds, 'personnel_count'),
					error: null
				});
			}
			if (name === 'count_memberships_by_organization') {
				return Promise.resolve({
					data: countRowsByOrganization(tables.organization_memberships ?? [], organizationIds, 'membership_count'),
					error: null
				});
			}
			throw new Error(`Unexpected RPC ${name}`);
		},
		from(table: string) {
			return new FakeQuery(table, tables[table] ?? [], calls);
		}
	} as unknown as SupabaseClient;

	return { supabase, calls };
}

describe('createSupabasePlatformActivationHealthStore', () => {
	it('maps activation facts from safe aggregate fields without selecting checkout URLs or provider IDs', async () => {
		const { supabase, calls } = createSupabaseStub({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					created_at: '2026-06-01T00:00:00.000Z',
					created_by: 'user-secret-not-selected',
					stripe_customer_id: 'cus_secret_not_selected',
					stripe_subscription_id: 'sub_secret_not_selected'
				},
				{
					id: 'org-free',
					name: 'Free Company',
					created_at: '2026-06-02T00:00:00.000Z'
				},
				{
					id: 'org-2',
					name: 'Bravo Company',
					created_at: '2026-06-03T00:00:00.000Z'
				}
			],
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
					status: 'expired',
					created_at: '2026-06-01T00:03:00.000Z',
					updated_at: null,
					completed_at: null,
					canceled_at: null,
					expires_at: '2026-06-01T01:30:00.000Z',
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
		const factsByOrgId = new Map(facts.map((item) => [item.organizationId, item]));

		expect(facts).toHaveLength(3);
		expect(factsByOrgId.get('org-1')).toMatchObject({
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
				attemptCount: 3,
				completedCount: 1,
				interruptedCount: 2,
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
		expect(factsByOrgId.get('org-2')).toMatchObject({
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
		expect(factsByOrgId.get('org-free')).toMatchObject({
			organizationId: 'org-free',
			organizationName: 'Free Company',
			billing: null,
			checkout: {
				attemptCount: 0,
				completedCount: 0,
				interruptedCount: 0,
				inProgressCount: 0,
				latestStatus: null,
				latestAt: null
			}
		});

		const organizationSelects = calls.filter((call) => call.table === 'organizations' && call.method === 'select');
		expect(organizationSelects.length).toBeGreaterThan(0);
		expect([...new Set(organizationSelects.map((call) => String(call.args[0])))]).toEqual([
			EXPECTED_ORGANIZATION_SELECT
		]);

		const checkoutSelects = calls.filter(
			(call) => call.table === 'organization_checkout_attempts' && call.method === 'select'
		);
		expect(checkoutSelects.length).toBeGreaterThan(0);
		expect([...new Set(checkoutSelects.map((call) => String(call.args[0])))]).toEqual([EXPECTED_CHECKOUT_SELECT]);

		const billingSelects = calls.filter(
			(call) => call.table === 'organization_billing_snapshots' && call.method === 'select'
		);
		expect(billingSelects.length).toBeGreaterThan(0);
		expect([...new Set(billingSelects.map((call) => String(call.args[0])))]).toEqual([EXPECTED_BILLING_SELECT]);
	});

	it('requeries selected organizations so checkout counts are complete beyond the discovery sample', async () => {
		const organization = {
			id: 'org-1',
			name: 'Able Company',
			created_at: '2026-06-01T00:00:00.000Z'
		};
		const checkoutRows = Array.from({ length: 6 }, (_, index) => ({
			organization_id: 'org-1',
			commercial_plan: 'team',
			status:
				index === 0
					? 'completed'
					: index === 1
						? 'failed'
						: index === 2
							? 'in_progress'
							: index === 3
								? 'canceled'
								: 'expired',
			created_at: `2026-06-01T00:0${index}:00.000Z`,
			updated_at: `2026-06-01T00:0${index}:30.000Z`,
			completed_at: index === 0 ? '2026-06-01T00:00:45.000Z' : null,
			canceled_at: index === 3 ? '2026-06-01T00:03:45.000Z' : null,
			expires_at: `2026-06-01T01:0${index}:00.000Z`,
			organizations: organization
		}));
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
					organizations: organization
				}
			],
			organization_checkout_attempts: checkoutRows
		});

		const facts = await createSupabasePlatformActivationHealthStore(supabase).listActivationOrganizationFacts({
			limit: 1
		});

		expect(facts).toHaveLength(1);
		expect(facts[0]?.checkout).toMatchObject({
			attemptCount: 6,
			completedCount: 1,
			interruptedCount: 4,
			inProgressCount: 1
		});
		expect(
			calls.some(
				(call) =>
					call.table === 'organization_checkout_attempts' &&
					call.method === 'in' &&
					call.args[0] === 'organization_id' &&
					JSON.stringify(call.args[1]) === JSON.stringify(['org-1'])
			)
		).toBe(true);
	});

	it('paginates setup count reads with a stable order so large organizations do not undercount', async () => {
		const organization = {
			id: 'org-large',
			name: 'Large Company',
			created_at: '2026-06-01T00:00:00.000Z'
		};
		const { supabase, calls } = createSupabaseStub({
			organization_billing_snapshots: [
				{
					organization_id: organization.id,
					source: 'stripe',
					commercial_plan: 'team',
					subscription_status: 'active',
					collection_status: 'current',
					sync_status: 'synced',
					last_processed_at: '2026-06-28T00:00:00.000Z',
					updated_at: '2026-06-28T00:00:00.000Z',
					organizations: organization
				}
			],
			training_types: Array.from({ length: 1005 }, (_, index) => ({
				id: `training-type-${String(index).padStart(4, '0')}`,
				organization_id: organization.id,
				name: `Training ${index}`
			}))
		});

		const facts = await createSupabasePlatformActivationHealthStore(supabase).listActivationOrganizationFacts({
			limit: 1
		});

		expect(facts[0]?.counts.trainingTypes).toBe(1005);
		expect(
			calls.filter(
				(call) => call.table === 'training_types' && call.method === 'range' && JSON.stringify(call.args) === '[0,999]'
			)
		).toHaveLength(1);
		expect(
			calls.filter(
				(call) =>
					call.table === 'training_types' && call.method === 'range' && JSON.stringify(call.args) === '[1000,1999]'
			)
		).toHaveLength(1);
		expect(
			calls.filter((call) => call.table === 'training_types' && call.method === 'order').map((call) => call.args[0])
		).toEqual(['organization_id', 'id', 'organization_id', 'id']);
	});

	it('prioritizes paid candidates over newer free organizations when the candidate set is capped', async () => {
		const paidOrganization = {
			id: 'org-paid-old',
			name: 'Paid Older Company',
			created_at: '2026-06-01T00:00:00.000Z'
		};
		const { supabase } = createSupabaseStub({
			organizations: [
				{
					id: 'org-free-new',
					name: 'Newest Free Company',
					created_at: '2026-06-28T00:00:00.000Z'
				}
			],
			organization_billing_snapshots: [
				{
					organization_id: paidOrganization.id,
					source: 'stripe',
					commercial_plan: 'team',
					subscription_status: 'active',
					collection_status: 'current',
					sync_status: 'synced',
					last_processed_at: '2026-06-28T00:00:00.000Z',
					updated_at: '2026-06-28T00:00:00.000Z',
					organizations: paidOrganization
				}
			]
		});

		const facts = await createSupabasePlatformActivationHealthStore(supabase).listActivationOrganizationFacts({
			limit: 1
		});

		expect(facts.map((item) => item.organizationId)).toEqual(['org-paid-old']);
	});
});
