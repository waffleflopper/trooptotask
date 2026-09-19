import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

import { createSupabaseOrgProvisioningPort } from './supabaseOrgProvisioning';

type Call = { method: string; args: unknown[] };
type QueryResult = { data?: unknown; error?: unknown; count?: number | null };
type OrganizationBillingRow = {
	id: string;
	tier: 'free' | 'team' | 'unit';
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	subscription_status: string | null;
	current_period_end: string | null;
	gift_tier: 'free' | 'team' | 'unit' | null;
	gift_expires_at: string | null;
};

function createPolicyProvisioningSupabase(input: {
	ownedOrganizationIds: string[];
	organizations: Record<string, OrganizationBillingRow>;
}) {
	const organizationListCalls: Call[] = [];
	const organizationSingleCalls: Call[][] = [];

	function findEqValue(calls: Call[], column: string): unknown {
		return calls.findLast((call) => call.method === 'eq' && call.args[0] === column)?.args[1];
	}

	const supabase = {
		from: vi.fn((table: string) => {
			const calls: Call[] = [];
			const builder: Record<string, unknown> = {
				select: (...args: unknown[]) => {
					calls.push({ method: 'select', args });
					return builder;
				},
				eq: (...args: unknown[]) => {
					calls.push({ method: 'eq', args });
					return builder;
				},
				range: (...args: unknown[]) => {
					calls.push({ method: 'range', args });
					return builder;
				},
				single: () => {
					if (table === 'organizations') {
						organizationSingleCalls.push(calls);
						const orgId = findEqValue(calls, 'id');
						return Promise.resolve({ data: input.organizations[String(orgId)], error: null });
					}
					if (table === 'organization_billing_snapshots') {
						return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
					}
					return Promise.resolve({ data: null, error: { message: `Unexpected table ${table}` } });
				},
				then: (resolve: (value: QueryResult) => void, reject: (reason: unknown) => void) => {
					if (table === 'organizations') {
						organizationListCalls.push(...calls);
						return Promise.resolve({
							data: input.ownedOrganizationIds.map((id) => ({ id })),
							error: null,
							count: input.ownedOrganizationIds.length
						}).then(resolve, reject);
					}
					if (table === 'organization_plan_feature_overrides') {
						return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
					}
					return Promise.resolve({ data: null, error: { message: `Unexpected table ${table}` } }).then(resolve, reject);
				}
			};

			return builder;
		})
	};

	return {
		supabase,
		organizationListCalls,
		organizationSingleCalls
	};
}

function organizationBillingRow(overrides: Partial<OrganizationBillingRow> & { id: string }): OrganizationBillingRow {
	return {
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

describe('createSupabaseOrgProvisioningPort', () => {
	beforeEach(() => {
		billingEnabledMock.mockReturnValue(true);
	});

	it('denies organization creation from plan-policy owned-organization limits', async () => {
		const { supabase, organizationListCalls } = createPolicyProvisioningSupabase({
			ownedOrganizationIds: ['org-1'],
			organizations: {
				'org-1': organizationBillingRow({ id: 'org-1' })
			}
		});
		const port = createSupabaseOrgProvisioningPort({ supabase } as never);

		const result = await port.canCreateOrganization('user-1');

		expect(result).toEqual({
			allowed: false,
			message: 'You can own up to 1 organization(s) on your current plan.'
		});
		expect(supabase.from).toHaveBeenCalledWith('organizations');
		expect(organizationListCalls).toContainEqual({ method: 'eq', args: ['created_by', 'user-1'] });
	});

	it('denies organization creation when a paid unit policy has no ownership headroom', async () => {
		const { supabase } = createPolicyProvisioningSupabase({
			ownedOrganizationIds: ['org-1', 'org-2'],
			organizations: {
				'org-1': organizationBillingRow({ id: 'org-1', tier: 'unit' }),
				'org-2': organizationBillingRow({ id: 'org-2', tier: 'free' })
			}
		});
		const port = createSupabaseOrgProvisioningPort({ supabase } as never);

		await expect(port.canCreateOrganization('user-1')).resolves.toEqual({
			allowed: false,
			message: 'You can own up to 1 organization(s) on your current plan.'
		});
	});

	it('denies organization creation when an active gift policy has no ownership headroom', async () => {
		const { supabase } = createPolicyProvisioningSupabase({
			ownedOrganizationIds: ['org-1', 'org-2'],
			organizations: {
				'org-1': organizationBillingRow({
					id: 'org-1',
					tier: 'free',
					gift_tier: 'unit',
					gift_expires_at: '2999-01-01T00:00:00.000Z'
				}),
				'org-2': organizationBillingRow({ id: 'org-2', tier: 'free' })
			}
		});
		const port = createSupabaseOrgProvisioningPort({ supabase } as never);

		await expect(port.canCreateOrganization('user-1')).resolves.toEqual({
			allowed: false,
			message: 'You can own up to 1 organization(s) on your current plan.'
		});
	});

	it('denies organization creation when a gift policy has expired', async () => {
		const { supabase } = createPolicyProvisioningSupabase({
			ownedOrganizationIds: ['org-1', 'org-2'],
			organizations: {
				'org-1': organizationBillingRow({
					id: 'org-1',
					tier: 'free',
					gift_tier: 'unit',
					gift_expires_at: '2020-01-01T00:00:00.000Z'
				}),
				'org-2': organizationBillingRow({ id: 'org-2', tier: 'free' })
			}
		});
		const port = createSupabaseOrgProvisioningPort({ supabase } as never);

		await expect(port.canCreateOrganization('user-1')).resolves.toEqual({
			allowed: false,
			message: 'You can own up to 1 organization(s) on your current plan.'
		});
	});

	it('preserves billing-disabled unlimited organization creation behavior', async () => {
		billingEnabledMock.mockReturnValue(false);
		const { supabase } = createPolicyProvisioningSupabase({
			ownedOrganizationIds: ['org-1'],
			organizations: {
				'org-1': organizationBillingRow({ id: 'org-1' })
			}
		});
		const port = createSupabaseOrgProvisioningPort({ supabase } as never);

		await expect(port.canCreateOrganization('user-1')).resolves.toEqual({ allowed: true });
		expect(supabase.from).not.toHaveBeenCalled();
	});
});

// Exercise the real SDK wire format without connecting to a provider. SQL/RLS and
// transaction guarantees belong to the isolated database contract in 02-03-04.
function httpPort(handle: (request: Request) => Promise<Response>) {
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: (input, init) => handle(new Request(input, init)) }
	});
	return createSupabaseOrgProvisioningPort({ supabase } as never);
}

function providerFailure(message: string) {
	return Response.json({ code: '42501', message, details: '', hint: '' }, { status: 403 });
}

describe('provisioning provider boundary', () => {
	it.each([
		['created', 200, 'org-created', { orgId: 'org-created', errorMessage: null }],
		[
			'owner denied',
			403,
			{ code: '42501', message: 'Owner insert denied' },
			{ orgId: null, errorMessage: 'Owner insert denied' }
		],
		['missing result', 200, null, { orgId: null, errorMessage: null }]
	] as const)('maps %s through the authenticated owner-creation RPC', async (_, status, body, expected) => {
		const requests: Array<{ path: string; method: string; body: unknown }> = [];
		const port = httpPort(async (request) => {
			requests.push({ path: new URL(request.url).pathname, method: request.method, body: await request.json() });
			return Response.json(body, { status });
		});
		expect(await port.createOrganizationWithOwner('Alpha Company')).toEqual(expected);
		// The RPC derives ownership from the authenticated session, never a supplied actor.
		expect(requests).toEqual([
			{ path: '/rest/v1/rpc/create_org_with_owner', method: 'POST', body: { p_name: 'Alpha Company' } }
		]);
	});

	it('updates only the requested owner membership, preserving another actor and another Organization', async () => {
		const memberships = [
			{ organization_id: 'org-1', user_id: 'user-1', email: 'old@example.test' },
			{ organization_id: 'org-1', user_id: 'user-2', email: 'member@example.test' },
			{ organization_id: 'org-2', user_id: 'user-1', email: 'sibling@example.test' }
		];
		const port = httpPort(async (request) => {
			const url = new URL(request.url);
			expect(url.pathname).toBe('/rest/v1/organization_memberships');
			expect(request.method).toBe('PATCH');
			const patch = await request.json();
			for (const row of memberships) {
				const matches = [...url.searchParams].every(([key, value]) => row[key as keyof typeof row] === value.slice(3));
				if (matches) Object.assign(row, patch);
			}
			return new Response(null, { status: 204 });
		});
		expect(
			await port.updateOwnerMembershipEmail({ organizationId: 'org-1', userId: 'user-1', email: 'owner@example.test' })
		).toBeNull();
		expect(memberships).toEqual([
			{ organization_id: 'org-1', user_id: 'user-1', email: 'owner@example.test' },
			{ organization_id: 'org-1', user_id: 'user-2', email: 'member@example.test' },
			{ organization_id: 'org-2', user_id: 'user-1', email: 'sibling@example.test' }
		]);
	});

	const writes = [
		{
			name: 'owner email',
			table: 'organization_memberships',
			write: (port: ReturnType<typeof httpPort>) =>
				port.updateOwnerMembershipEmail({ organizationId: 'org-1', userId: 'user-1', email: 'owner@example.test' }),
			body: { email: 'owner@example.test' }
		},
		{
			name: 'Groups',
			table: 'groups',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedDefaultGroups('org-1', [{ name: 'Leadership', sortOrder: 0 }]),
			body: [{ organization_id: 'org-1', name: 'Leadership', sort_order: 0 }]
		},
		{
			name: 'statuses',
			table: 'status_types',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedDefaultStatusTypes('org-1', [
					{
						name: 'Leave',
						color: '#48bb78',
						textColor: '#ffffff',
						sortOrder: 0,
						da6AvailabilityTreatment: 'authorized-absence',
						da6TreatmentReviewed: true
					}
				]),
			body: [
				{
					organization_id: 'org-1',
					name: 'Leave',
					color: '#48bb78',
					text_color: '#ffffff',
					sort_order: 0,
					da6_availability_treatment: 'authorized-absence',
					da6_treatment_reviewed: true
				}
			]
		},
		{
			name: 'manual assignments',
			table: 'assignment_types',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedDefaultAssignmentTypes('org-1', [
					{ name: 'Staff Duty', shortName: 'SD', assignTo: 'personnel', color: '#dc2626', sortOrder: 0 }
				]),
			body: [
				{
					organization_id: 'org-1',
					name: 'Staff Duty',
					short_name: 'SD',
					assign_to: 'personnel',
					color: '#dc2626',
					sort_order: 0
				}
			]
		},
		{
			name: 'holidays',
			table: 'special_days',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedFederalHolidays('org-1', [{ date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' }]),
			body: [{ organization_id: 'org-1', date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' }]
		},
		{
			name: 'ranks',
			table: 'organization_rank_catalog',
			write: (port: ReturnType<typeof httpPort>) =>
				port.seedDefaultRankCatalog('org-1', [
					{
						code: 'SGT',
						label: 'Sergeant',
						service: 'army',
						category: 'enlisted',
						payGrade: 'E-5',
						state: 'active',
						source: 'built-in',
						sortOrder: 0
					}
				]),
			body: [
				{
					organization_id: 'org-1',
					code: 'SGT',
					label: 'Sergeant',
					service: 'army',
					category: 'enlisted',
					pay_grade: 'E-5',
					state: 'active',
					source: 'built-in',
					sort_order: 0
				}
			]
		}
	];

	it.each(writes)(
		'serializes $name at the provider boundary and surfaces write denial',
		async ({ write, table, body }) => {
			for (const denied of [false, true]) {
				const received: unknown[] = [];
				const port = httpPort(async (request) => {
					expect(new URL(request.url).pathname).toBe(`/rest/v1/${table}`);
					expect(request.method).toBe(table === 'organization_memberships' ? 'PATCH' : 'POST');
					received.push(await request.json());
					return denied ? providerFailure('Write denied') : new Response(null, { status: 201 });
				});
				expect(await write(port)).toBe(denied ? 'Write denied' : null);
				expect(received).toEqual([body]);
			}
		}
	);

	it('preserves an earlier holiday write error when a later batch succeeds', async () => {
		const days = Array.from({ length: 51 }, (_, index) => ({
			date: '2026-01-01',
			name: `Synthetic holiday ${index}`,
			type: 'federal-holiday'
		}));
		const received: unknown[] = [];
		const port = httpPort(async (request) => {
			received.push(...(await request.json()));
			return received.length <= 50 ? providerFailure('First batch denied') : new Response(null, { status: 201 });
		});
		expect(await port.seedFederalHolidays('org-1', days)).toBe('First batch denied');
		expect(received).toEqual(days.map((day) => ({ organization_id: 'org-1', ...day })));
	});

	it('sends duplicate-ignore rank writes scoped to Organization and code', async () => {
		const port = httpPort(async (request) => {
			expect(new URL(request.url).searchParams.get('on_conflict')).toBe('organization_id,code');
			expect(request.headers.get('prefer')).toContain('resolution=ignore-duplicates');
			return new Response(null, { status: 201 });
		});
		expect(await writes[5].write(port)).toBeNull();
	});
});
