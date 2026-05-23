import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgSettingsMemberManagementPort } from './supabaseOrgSettingsMemberManagement';

type Call = { method: string; args: unknown[] };

function buildAdapterPermissions() {
	return {
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
		canManageMembers: false
	};
}

function createMembershipLookupBuilder() {
	const calls: Call[] = [];
	const result = {
		data: {
			user_id: 'member-1',
			role: 'member',
			email: 'member@example.com',
			can_manage_members: true
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

function createInvitationInsertBuilder(result: {
	data?: { id: string; created_at?: string } | null;
	error: { message: string } | null;
}) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		insert: track('insert'),
		select: track('select'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return {
				data: result.data ?? { id: 'invite-created', created_at: '2026-05-22T12:00:00.000Z' },
				error: result.error
			};
		}
	};

	return { builder, calls };
}

function createPendingInvitationByIdBuilder(
	result: {
		data?: Record<string, unknown> | null;
		error?: unknown;
	} = {}
) {
	const calls: Call[] = [];
	const resolvedResult = {
		data: {
			id: 'invite-1',
			email: 'invitee@example.com',
			expires_at: '2099-05-23T12:00:00.000Z',
			access_request_organization_invitation_links: []
		},
		error: null,
		...result
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
			return resolvedResult;
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
		select: track('select'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return { data: { id: 'invite-1' }, error: null };
		},
		lte: (...args: unknown[]) => {
			calls.push({ method: 'lte', args });
			return { error: null };
		}
	};

	return { builder, calls };
}

function createAccessRequestLookupBuilder(result: { data: { id: string } | null; error: unknown }) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: track('select'),
		ilike: track('ilike'),
		eq: track('eq'),
		maybeSingle: (...args: unknown[]) => {
			calls.push({ method: 'maybeSingle', args });
			return result;
		}
	};

	return { builder, calls };
}

function createAccessRequestInsertBuilder(result: {
	data: { id: string } | null;
	error: { message: string; code?: string } | null;
}) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		insert: track('insert'),
		select: track('select'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return result;
		}
	};

	return { builder, calls };
}

function createInvitationAccessRequestLinkInsertBuilder(result: { error: { message: string; code?: string } | null }) {
	const calls: Call[] = [];
	const builder: Record<string, unknown> = {
		insert: (...args: unknown[]) => {
			calls.push({ method: 'insert', args });
			return result;
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

		expect(result).toEqual({
			status: 'created',
			invitationId: 'invite-created',
			createdAt: '2026-05-22T12:00:00.000Z'
		});
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
			},
			{ method: 'select', args: ['id, created_at'] },
			{ method: 'single', args: [] }
		]);
	});

	it('finds pending invitations by id inside the organization without reading access snapshot fields', async () => {
		const { builder, calls } = createPendingInvitationByIdBuilder();
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase
		} as never);

		const result = await port.findPendingInvitationById('org-1', 'invite-1');

		expect(result).toEqual({
			id: 'invite-1',
			email: 'invitee@example.com',
			status: 'pending',
			requiresAccountSetup: false
		});
		expect(supabase.from).toHaveBeenCalledWith('organization_invitations');
		expect(calls).toContainEqual({
			method: 'select',
			args: ['id, email, expires_at, access_request_organization_invitation_links(id)']
		});
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'invite-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(calls).not.toContainEqual({ method: 'gt', args: ['expires_at', expect.any(String)] });
	});

	it('marks resend lookups as account-setup invitations when an access-request link exists', async () => {
		const { builder } = createPendingInvitationByIdBuilder({
			data: {
				id: 'invite-1',
				email: 'invitee@example.com',
				expires_at: '2099-05-23T12:00:00.000Z',
				access_request_organization_invitation_links: [{ id: 'link-1' }]
			}
		});
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase: {
				from: vi.fn(() => builder)
			}
		} as never);

		await expect(port.findPendingInvitationById('org-1', 'invite-1')).resolves.toEqual({
			id: 'invite-1',
			email: 'invitee@example.com',
			status: 'pending',
			requiresAccountSetup: true
		});
	});

	it('materializes stale pending invitations as expired during resend lookup', async () => {
		const { builder: lookupBuilder } = createPendingInvitationByIdBuilder({
			data: {
				id: 'invite-1',
				email: 'invitee@example.com',
				expires_at: '2000-05-21T12:00:00.000Z',
				access_request_organization_invitation_links: []
			}
		});
		const { builder: expireBuilder, calls: expireCalls } = createInvitationExpiryBuilder();
		const supabase = {
			from: vi.fn().mockReturnValueOnce(lookupBuilder).mockReturnValueOnce(expireBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({ supabase } as never);

		await expect(port.findPendingInvitationById('org-1', 'invite-1')).resolves.toEqual({
			id: 'invite-1',
			email: 'invitee@example.com',
			status: 'expired',
			requiresAccountSetup: false
		});
		expect(expireCalls).toContainEqual({
			method: 'update',
			args: [expect.objectContaining({ status: 'expired', expired_at: expect.any(String) })]
		});
		expect(expireCalls).toContainEqual({ method: 'eq', args: ['id', 'invite-1'] });
		expect(expireCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(expireCalls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(expireCalls).toContainEqual({ method: 'lte', args: ['expires_at', expect.any(String)] });
	});

	it('looks up existing User Accounts through the admin auth boundary before bridging access requests', async () => {
		const adminSupabase = {
			auth: {
				admin: {
					listUsers: vi.fn().mockResolvedValue({
						data: { users: [{ id: 'user-1', email: 'USER@example.com' }] },
						error: null
					})
				}
			}
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(port.findUserAccountByEmail(' user@example.com ')).resolves.toEqual({
			id: 'user-1',
			email: 'user@example.com'
		});
		expect(adminSupabase.auth.admin.listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
	});

	it('creates a pending Access Request and stores the originating Organization Invitation context for non-users', async () => {
		const { builder: lookupBuilder, calls: lookupCalls } = createAccessRequestLookupBuilder({
			data: null,
			error: null
		});
		const { builder: requestInsertBuilder, calls: requestInsertCalls } = createAccessRequestInsertBuilder({
			data: { id: 'access-request-1' },
			error: null
		});
		const { builder: linkInsertBuilder, calls: linkInsertCalls } = createInvitationAccessRequestLinkInsertBuilder({
			error: null
		});
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(lookupBuilder)
				.mockReturnValueOnce(requestInsertBuilder)
				.mockReturnValueOnce(linkInsertBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		const result = await port.createOrLinkPendingAccessRequestForInvitation({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			email: 'Invitee@Example.com',
			invitedBy: 'owner-1',
			invitedAt: '2026-05-22T12:00:00.000Z',
			role: 'member',
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
				canManageMembers: false
			},
			memberPreset: 'viewer',
			capabilityOverrides: { personnel: 'view' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['11111111-1111-4111-8111-111111111111']
		});

		expect(result).toEqual({ status: 'created', accessRequestId: 'access-request-1' });
		expect(adminSupabase.from).toHaveBeenNthCalledWith(1, 'access_requests');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(2, 'access_requests');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(3, 'access_request_organization_invitation_links');
		expect(lookupCalls).toContainEqual({ method: 'eq', args: ['email', 'invitee@example.com'] });
		expect(lookupCalls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(requestInsertCalls).toContainEqual({
			method: 'insert',
			args: [
				expect.objectContaining({
					email: 'invitee@example.com',
					name: 'invitee@example.com',
					heard_about: 'other',
					heard_about_details: 'Organization Invitation'
				})
			]
		});
		expect(linkInsertCalls).toEqual([
			{
				method: 'insert',
				args: [
					expect.objectContaining({
						access_request_id: 'access-request-1',
						organization_invitation_id: 'invite-1',
						organization_id: 'org-1',
						invited_by: 'owner-1',
						invited_at: '2026-05-22T12:00:00.000Z',
						intended_member_preset: 'viewer',
						intended_capability_overrides: { personnel: 'view' },
						intended_access_scope_kind: 'groups',
						intended_access_scope_group_ids: ['11111111-1111-4111-8111-111111111111']
					})
				]
			}
		]);
	});

	it('links a duplicate pending Access Request to the new Organization Invitation without inserting another request', async () => {
		const { builder: lookupBuilder } = createAccessRequestLookupBuilder({
			data: { id: 'pending-request-1' },
			error: null
		});
		const { builder: linkInsertBuilder } = createInvitationAccessRequestLinkInsertBuilder({ error: null });
		const adminSupabase = {
			from: vi.fn().mockReturnValueOnce(lookupBuilder).mockReturnValueOnce(linkInsertBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkPendingAccessRequestForInvitation({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				email: 'pending@example.com',
				invitedBy: 'owner-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				permissions: buildAdapterPermissions(),
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({ status: 'linked', accessRequestId: 'pending-request-1' });

		expect(adminSupabase.from).toHaveBeenCalledTimes(2);
		expect(adminSupabase.from).not.toHaveBeenNthCalledWith(2, 'access_requests');
	});

	it('blocks a just-created invitation when the non-user Access Request bridge fails', async () => {
		const { builder, calls } = createInvitationExpiryBuilder();
		const adminSupabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.blockInvitationAfterAccessRequestBridgeFailure({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				blockedBy: 'owner-1',
				reason: 'access request store unavailable'
			})
		).resolves.toEqual({ status: 'blocked' });

		expect(adminSupabase.from).toHaveBeenCalledWith('organization_invitations');
		expect(calls).toContainEqual({
			method: 'update',
			args: [
				expect.objectContaining({
					status: 'blocked',
					blocked_at: expect.any(String),
					blocked_by: 'owner-1'
				})
			]
		});
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'invite-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(calls).toContainEqual({ method: 'select', args: ['id'] });
		expect(calls).toContainEqual({ method: 'single', args: [] });
	});

	it('does not swallow unrelated unique constraint failures while creating invite-origin Access Requests', async () => {
		const { builder: lookupBuilder } = createAccessRequestLookupBuilder({
			data: null,
			error: null
		});
		const { builder: requestInsertBuilder } = createAccessRequestInsertBuilder({
			data: null,
			error: {
				code: '23505',
				message: 'duplicate key value violates unique constraint "some_other_unique_idx"'
			}
		});
		const adminSupabase = {
			from: vi.fn().mockReturnValueOnce(lookupBuilder).mockReturnValueOnce(requestInsertBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkPendingAccessRequestForInvitation({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				email: 'pending@example.com',
				invitedBy: 'owner-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				permissions: buildAdapterPermissions(),
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({
			status: 'failed',
			message: 'duplicate key value violates unique constraint "some_other_unique_idx"'
		});
		expect(adminSupabase.from).toHaveBeenCalledTimes(2);
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
			email: 'member@example.com',
			canManageMembers: true
		});
		expect(supabase.from).toHaveBeenCalledWith('organization_memberships');
		expect(calls).toContainEqual({ method: 'select', args: ['user_id, role, email, can_manage_members'] });
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
