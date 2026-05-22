import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgSettingsMemberManagementPort } from './supabaseOrgSettingsMemberManagement';

type Call = { method: string; args: unknown[] };

function createMembershipLookupBuilder() {
	const calls: Call[] = [];
	const result = {
		data: {
			user_id: 'member-1',
			role: 'member',
			email: 'member@example.com'
		},
		error: null
	};

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return result;
		}
	};

	return { builder, calls };
}

function createInvitationLookupBuilder() {
	const calls: Call[] = [];
	const result = {
		data: {
			id: 'invite-1'
		},
		error: null
	};

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return result;
		}
	};

	return { builder, calls };
}

function createMembershipRemovalBuilder(result: { data: unknown[] | null; error: { message: string } | null }) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		delete: track('delete'),
		eq: track('eq'),
		select: (...args: unknown[]) => {
			calls.push({ method: 'select', args });
			return result;
		}
	};

	return { builder, calls };
}

describe('createSupabaseOrgSettingsMemberManagementPort', () => {
	it('looks up duplicate pending invitations by normalized email inside the organization', async () => {
		const { builder, calls } = createInvitationLookupBuilder();
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase
		} as never);

		const result = await port.findPendingInvitation('org-1', 'user@example.com');

		expect(result).toEqual({ id: 'invite-1' });
		expect(supabase.from).toHaveBeenCalledWith('organization_invitations');
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['normalized_email', 'user@example.com'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
	});

	it('scopes membership lookups by both membership id and organization id', async () => {
		const { builder, calls } = createMembershipLookupBuilder();
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase
		} as never);

		const result = await port.findMembershipById('org-1', 'membership-1');

		expect(result).toEqual({
			userId: 'member-1',
			role: 'member',
			email: 'member@example.com'
		});
		expect(supabase.from).toHaveBeenCalledWith('organization_memberships');
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'membership-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
	});

	it('removes memberships with the admin client and verifies a row was deleted', async () => {
		const { builder, calls } = createMembershipRemovalBuilder({
			data: [{ id: 'membership-1' }],
			error: null
		});
		const supabase = {
			from: vi.fn()
		};
		const adminSupabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase
			} as never,
			{
				getAdminClient: () => adminSupabase as never
			}
		);

		const result = await port.removeMembership('org-1', 'membership-1');

		expect(result).toBeNull();
		expect(supabase.from).not.toHaveBeenCalled();
		expect(adminSupabase.from).toHaveBeenCalledWith('organization_memberships');
		expect(calls).toContainEqual({ method: 'delete', args: [] });
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'membership-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(calls).toContainEqual({ method: 'select', args: ['id'] });
	});

	it('reports failure when a membership removal deletes no rows', async () => {
		const { builder } = createMembershipRemovalBuilder({
			data: [],
			error: null
		});
		const adminSupabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{
				getAdminClient: () => adminSupabase as never
			}
		);

		await expect(port.removeMembership('org-1', 'membership-1')).resolves.toBe('Membership could not be removed');
	});

	it('reports provider errors when membership removal fails', async () => {
		const { builder } = createMembershipRemovalBuilder({
			data: null,
			error: { message: 'delete blocked' }
		});
		const adminSupabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{
				getAdminClient: () => adminSupabase as never
			}
		);

		await expect(port.removeMembership('org-1', 'membership-1')).resolves.toBe('delete blocked');
	});
});
