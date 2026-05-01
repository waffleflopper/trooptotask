import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgProvisioningPort } from './supabaseOrgProvisioning';

type Call = { method: string; args: unknown[] };

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

describe('createSupabaseOrgProvisioningPort', () => {
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
