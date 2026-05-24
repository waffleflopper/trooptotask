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

function createUpdateBuilder() {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		update: track('update'),
		eq: track('eq'),
		then: undefined
	};

	Object.assign(builder, {
		eq: (...args: unknown[]) => {
			calls.push({ method: 'eq', args });
			if (calls.filter((call) => call.method === 'eq').length >= 2) {
				return Promise.resolve({ error: null });
			}
			return builder;
		}
	});

	return { builder, calls };
}

function createInsertBuilder(errorMessage: string | null = null) {
	const insert = vi.fn().mockResolvedValue({
		error: errorMessage ? { message: errorMessage } : null
	});

	return {
		builder: { insert },
		insert
	};
}

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

	it('allows organization creation when a paid unit policy provides ownership headroom', async () => {
		const { supabase } = createPolicyProvisioningSupabase({
			ownedOrganizationIds: ['org-1', 'org-2'],
			organizations: {
				'org-1': organizationBillingRow({ id: 'org-1', tier: 'unit' }),
				'org-2': organizationBillingRow({ id: 'org-2', tier: 'free' })
			}
		});
		const port = createSupabaseOrgProvisioningPort({ supabase } as never);

		await expect(port.canCreateOrganization('user-1')).resolves.toEqual({ allowed: true });
	});

	it('allows organization creation when an active gift policy provides ownership headroom', async () => {
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

		await expect(port.canCreateOrganization('user-1')).resolves.toEqual({ allowed: true });
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

	it('calls the create_org_with_owner rpc to create the organization atomically', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: 'org-1', error: null });
		const port = createSupabaseOrgProvisioningPort({
			supabase: {
				rpc
			}
		} as never);

		const result = await port.createOrganizationWithOwner('Alpha Company');

		expect(result).toEqual({ orgId: 'org-1', errorMessage: null });
		expect(rpc).toHaveBeenCalledWith('create_org_with_owner', { p_name: 'Alpha Company' });
	});

	it('scopes the owner membership email update by organization and user', async () => {
		const { builder, calls } = createUpdateBuilder();
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgProvisioningPort({
			supabase
		} as never);

		const result = await port.updateOwnerMembershipEmail({
			organizationId: 'org-1',
			userId: 'user-1',
			email: 'owner@example.com'
		});

		expect(result).toBeNull();
		expect(supabase.from).toHaveBeenCalledWith('organization_memberships');
		expect(calls).toContainEqual({
			method: 'update',
			args: [{ email: 'owner@example.com' }]
		});
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
	});

	it('serializes group seeds for the groups table and returns insert errors as strings', async () => {
		const { builder, insert } = createInsertBuilder('groups failed');
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgProvisioningPort({
			supabase
		} as never);

		const result = await port.seedDefaultGroups('org-1', [
			{ name: 'Leadership', sortOrder: 0 },
			{ name: 'Alpha', sortOrder: 1 }
		]);

		expect(result).toBe('groups failed');
		expect(supabase.from).toHaveBeenCalledWith('groups');
		expect(insert).toHaveBeenCalledWith([
			{ organization_id: 'org-1', name: 'Leadership', sort_order: 0 },
			{ organization_id: 'org-1', name: 'Alpha', sort_order: 1 }
		]);
	});

	it('serializes status type seeds for the status_types table and returns insert errors as strings', async () => {
		const { builder, insert } = createInsertBuilder('statuses failed');
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgProvisioningPort({
			supabase
		} as never);

		const result = await port.seedDefaultStatusTypes('org-1', [
			{
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				sortOrder: 0
			}
		]);

		expect(result).toBe('statuses failed');
		expect(supabase.from).toHaveBeenCalledWith('status_types');
		expect(insert).toHaveBeenCalledWith([
			{
				organization_id: 'org-1',
				name: 'Leave',
				color: '#48bb78',
				text_color: '#ffffff',
				da6_availability_treatment: null,
				da6_treatment_reviewed: false,
				sort_order: 0
			}
		]);
	});

	it('serializes assignment type seeds for the assignment_types table and returns insert errors as strings', async () => {
		const { builder, insert } = createInsertBuilder('assignments failed');
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgProvisioningPort({
			supabase
		} as never);

		const result = await port.seedDefaultAssignmentTypes('org-1', [
			{
				name: 'Staff Duty',
				shortName: 'SD',
				assignTo: 'personnel',
				color: '#dc2626',
				sortOrder: 0
			}
		]);

		expect(result).toBe('assignments failed');
		expect(supabase.from).toHaveBeenCalledWith('assignment_types');
		expect(insert).toHaveBeenCalledWith([
			{
				organization_id: 'org-1',
				name: 'Staff Duty',
				short_name: 'SD',
				assign_to: 'personnel',
				color: '#dc2626',
				sort_order: 0
			}
		]);
	});

	it('inserts holiday seeds in batches of 50 rows to preserve the current payload behavior', async () => {
		const insert = vi.fn().mockResolvedValue({ error: null });
		const supabase = {
			from: vi.fn(() => ({ insert }))
		};
		const port = createSupabaseOrgProvisioningPort({
			supabase
		} as never);
		const specialDays = Array.from({ length: 120 }, (_, index) => ({
			date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
			name: `Holiday ${index + 1}`,
			type: 'federal-holiday'
		}));

		const result = await port.seedFederalHolidays('org-1', specialDays);

		expect(result).toBeNull();
		expect(supabase.from).toHaveBeenCalledWith('special_days');
		expect(insert).toHaveBeenCalledTimes(3);
		expect(insert.mock.calls[0]?.[0]).toHaveLength(50);
		expect(insert.mock.calls[1]?.[0]).toHaveLength(50);
		expect(insert.mock.calls[2]?.[0]).toHaveLength(20);
		expect(insert.mock.calls[0]?.[0][0]).toEqual({
			organization_id: 'org-1',
			date: '2026-01-01',
			name: 'Holiday 1',
			type: 'federal-holiday'
		});
	});
});
