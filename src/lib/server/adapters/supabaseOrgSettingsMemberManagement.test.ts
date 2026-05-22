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
		gt: track('gt'),
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
		gt: track('gt'),
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

function createInvitationInsertBuilder(result: { error: { message: string } | null }) {
	const calls: Call[] = [];
	const builder: Record<string, unknown> = {
		insert: (...args: unknown[]) => {
			calls.push({ method: 'insert', args });
			return result;
		}
	};

	return { builder, calls };
}

function createInvitationExpiryBuilder() {
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
		lte: (...args: unknown[]) => {
			calls.push({ method: 'lte', args });
			return { error: null };
		}
	};

	return { builder, calls };
}

function createRpcBuilder(result: unknown) {
	const calls: Call[] = [];
	const builder: Record<string, unknown> = {
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
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
		expect(calls).toContainEqual({ method: 'gt', args: ['expires_at', expect.any(String)] });
	});

	it('persists the intended invitation role with the access snapshot', async () => {
		const { builder: expireBuilder, calls: expireCalls } = createInvitationExpiryBuilder();
		const { builder, calls } = createInvitationInsertBuilder({ error: null });
		const supabase = {
			from: vi.fn().mockReturnValueOnce(expireBuilder).mockReturnValueOnce(builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase
		} as never);

		const result = await port.createInvitation({
			organizationId: 'org-1',
			email: 'user@example.com',
			invitedBy: 'owner-1',
			role: 'member',
			singleGroupCompatibilityId: null,
			permissions: {
				canViewCalendar: true,
				canEditCalendar: false,
				canViewPersonnel: true,
				canEditPersonnel: false,
				canViewTraining: true,
				canEditTraining: false,
				canViewCriticalTasks: true,
				canEditCriticalTasks: false,
				canViewOnboarding: true,
				canEditOnboarding: false,
				canViewRatingScheme: true,
				canEditRatingScheme: false,
				canManageMembers: true
			},
			memberPreset: 'viewer',
			capabilityOverrides: { personnel: 'configure' },
			accessScopeKind: 'organization',
			accessScopeGroupIds: []
		});

		expect(result).toBeNull();
		expect(supabase.from).toHaveBeenCalledWith('organization_invitations');
		expect(expireCalls).toContainEqual({
			method: 'update',
			args: [expect.objectContaining({ status: 'expired', expired_at: expect.any(String) })]
		});
		expect(expireCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(expireCalls).toContainEqual({ method: 'eq', args: ['normalized_email', 'user@example.com'] });
		expect(expireCalls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(expireCalls).toContainEqual({ method: 'lte', args: ['expires_at', expect.any(String)] });
		expect(calls).toEqual([
			{
				method: 'insert',
				args: [
					expect.objectContaining({
						organization_id: 'org-1',
						email: 'user@example.com',
						invited_by: 'owner-1',
						role: 'member',
						can_manage_members: true,
						member_preset: 'viewer',
						capability_overrides: { personnel: 'configure' },
						access_scope_kind: 'organization',
						access_scope_group_ids: []
					})
				]
			}
		]);
	});

	it('revokes invitations through the lifecycle transition RPC', async () => {
		const { builder, calls } = createRpcBuilder({
			data: {
				revoke_status: 'revoked',
				revoked_email: 'invitee@example.com'
			},
			error: null
		});
		const supabase = {
			rpc: vi.fn(() => builder),
			from: vi.fn()
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase
		} as never);

		const result = await port.revokeInvitation('org-1', 'invite-1');

		expect(result).toEqual({ status: 'revoked', email: 'invitee@example.com' });
		expect(supabase.rpc).toHaveBeenCalledWith('revoke_organization_invitation', {
			p_invitation_id: 'invite-1',
			p_organization_id: 'org-1'
		});
		expect(supabase.from).not.toHaveBeenCalled();
		expect(calls).toContainEqual({ method: 'single', args: [] });
	});

	it('maps provider errors from invitation revoke to a failed status', async () => {
		const { builder } = createRpcBuilder({
			data: null,
			error: { message: 'rpc unavailable' }
		});
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase: {
				rpc: vi.fn(() => builder),
				from: vi.fn()
			}
		} as never);

		await expect(port.revokeInvitation('org-1', 'invite-1')).resolves.toEqual({ status: 'failed', email: null });
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
