import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgSettingsMemberManagementPort } from './memberManagementProvider.server';

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
			expires_at: '2099-05-23T12:00:00.000Z'
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

function createInvitationAccessRequestSetupLookupBuilder(
	result: {
		data?: Record<string, unknown> | null;
		error?: unknown;
	} = {}
) {
	const calls: Call[] = [];
	const resolvedResult = {
		data: null,
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
		maybeSingle: (...args: unknown[]) => {
			calls.push({ method: 'maybeSingle', args });
			return resolvedResult;
		}
	};

	return { builder, calls };
}

function createUserEmailIdentityLookupBuilder(
	result: {
		data?: Record<string, unknown> | null;
		error?: unknown;
	} = {}
) {
	const calls: Call[] = [];
	const resolvedResult = {
		data: {
			user_id: 'invitee-user-1',
			normalized_email: 'invitee@example.com'
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
		maybeSingle: (...args: unknown[]) => {
			calls.push({ method: 'maybeSingle', args });
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
		is: track('is'),
		not: track('not'),
		or: track('or'),
		order: track('order'),
		limit: track('limit'),
		maybeSingle: (...args: unknown[]) => {
			calls.push({ method: 'maybeSingle', args });
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
		const { builder: setupBuilder, calls: setupCalls } = createInvitationAccessRequestSetupLookupBuilder();
		const supabase = {
			from: vi.fn(() => builder)
		};
		const adminSupabase = {
			from: vi.fn(() => setupBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

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
			args: ['id, email, expires_at']
		});
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'invite-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(calls).not.toContainEqual({ method: 'gt', args: ['expires_at', expect.any(String)] });
		expect(adminSupabase.from).toHaveBeenCalledWith('access_request_organization_invitation_links');
		expect(setupCalls).toEqual([
			{ method: 'select', args: ['id, access_requests(email, setup_completed_at, setup_user_id)'] },
			{ method: 'eq', args: ['organization_invitation_id', 'invite-1'] },
			{ method: 'eq', args: ['organization_id', 'org-1'] },
			{ method: 'maybeSingle', args: [] }
		]);
	});

	it('marks resend lookups as account-setup invitations when a linked access request has not completed setup', async () => {
		const { builder } = createPendingInvitationByIdBuilder({
			data: {
				id: 'invite-1',
				email: 'invitee@example.com',
				expires_at: '2099-05-23T12:00:00.000Z'
			}
		});
		const { builder: setupBuilder } = createInvitationAccessRequestSetupLookupBuilder({
			data: {
				id: 'link-1',
				access_requests: { email: 'invitee@example.com', setup_completed_at: null, setup_user_id: null }
			}
		});
		const { builder: identityBuilder } = createUserEmailIdentityLookupBuilder();
		const { builder: completedSetupBuilder } = createAccessRequestLookupBuilder({
			data: null,
			error: null
		});
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(setupBuilder)
				.mockReturnValueOnce(identityBuilder)
				.mockReturnValueOnce(completedSetupBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: {
					from: vi.fn(() => builder)
				}
			} as never,
			{
				getAdminClient: () => adminSupabase as never
			}
		);

		await expect(port.findPendingInvitationById('org-1', 'invite-1')).resolves.toEqual({
			id: 'invite-1',
			email: 'invitee@example.com',
			status: 'pending',
			requiresAccountSetup: true
		});
		expect(adminSupabase.from).toHaveBeenNthCalledWith(1, 'access_request_organization_invitation_links');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(2, 'user_email_identities');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(3, 'access_requests');
	});

	it('marks resend lookups as sign-in invitations when a linked access request has completed setup', async () => {
		const { builder } = createPendingInvitationByIdBuilder({
			data: {
				id: 'invite-1',
				email: 'Invitee@Example.com',
				expires_at: '2099-05-23T12:00:00.000Z'
			}
		});
		const { builder: setupBuilder } = createInvitationAccessRequestSetupLookupBuilder({
			data: {
				id: 'link-1',
				access_requests: {
					email: 'invitee@example.com',
					setup_completed_at: '2026-05-22T12:00:00.000Z',
					setup_user_id: 'invitee-user-1'
				}
			}
		});
		const { builder: identityBuilder } = createUserEmailIdentityLookupBuilder();
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: {
					from: vi.fn(() => builder)
				}
			} as never,
			{
				getAdminClient: () =>
					({
						from: vi.fn().mockReturnValueOnce(setupBuilder).mockReturnValueOnce(identityBuilder)
					}) as never
			}
		);

		await expect(port.findPendingInvitationById('org-1', 'invite-1')).resolves.toEqual({
			id: 'invite-1',
			email: 'Invitee@Example.com',
			status: 'pending',
			requiresAccountSetup: false
		});
	});

	it('keeps resend lookups in setup mode when completed setup belongs to another user identity', async () => {
		const { builder } = createPendingInvitationByIdBuilder({
			data: {
				id: 'invite-1',
				email: 'Invitee@Example.com',
				expires_at: '2099-05-23T12:00:00.000Z'
			}
		});
		const { builder: setupBuilder } = createInvitationAccessRequestSetupLookupBuilder({
			data: {
				id: 'link-1',
				access_requests: {
					email: 'invitee@example.com',
					setup_completed_at: '2026-05-22T12:00:00.000Z',
					setup_user_id: 'previous-user-1'
				}
			}
		});
		const { builder: identityBuilder } = createUserEmailIdentityLookupBuilder({
			data: {
				user_id: 'invitee-user-1',
				normalized_email: 'invitee@example.com'
			}
		});
		const { builder: completedSetupBuilder, calls: completedSetupCalls } = createAccessRequestLookupBuilder({
			data: null,
			error: null
		});
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(setupBuilder)
				.mockReturnValueOnce(identityBuilder)
				.mockReturnValueOnce(completedSetupBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: {
					from: vi.fn(() => builder)
				}
			} as never,
			{
				getAdminClient: () => adminSupabase as never
			}
		);

		await expect(port.findPendingInvitationById('org-1', 'invite-1')).resolves.toEqual({
			id: 'invite-1',
			email: 'Invitee@Example.com',
			status: 'pending',
			requiresAccountSetup: true
		});
		expect(completedSetupCalls).toContainEqual({
			method: 'or',
			args: ['setup_user_id.is.null,setup_user_id.eq.invitee-user-1']
		});
	});

	it('marks resend lookups as sign-in invitations when a separate same-email Access Request completed setup', async () => {
		const { builder } = createPendingInvitationByIdBuilder({
			data: {
				id: 'invite-1',
				email: 'Invitee@Example.com',
				expires_at: '2099-05-23T12:00:00.000Z'
			}
		});
		const { builder: setupBuilder } = createInvitationAccessRequestSetupLookupBuilder({
			data: {
				id: 'link-1',
				access_requests: { email: 'invitee@example.com', setup_completed_at: null, setup_user_id: null }
			}
		});
		const { builder: identityBuilder } = createUserEmailIdentityLookupBuilder();
		const { builder: completedSetupBuilder, calls: completedSetupCalls } = createAccessRequestLookupBuilder({
			data: { id: 'completed-request-1' },
			error: null
		});
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(setupBuilder)
				.mockReturnValueOnce(identityBuilder)
				.mockReturnValueOnce(completedSetupBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: {
					from: vi.fn(() => builder)
				}
			} as never,
			{
				getAdminClient: () => adminSupabase as never
			}
		);

		await expect(port.findPendingInvitationById('org-1', 'invite-1')).resolves.toEqual({
			id: 'invite-1',
			email: 'Invitee@Example.com',
			status: 'pending',
			requiresAccountSetup: false
		});
		expect(completedSetupCalls).toEqual([
			{ method: 'select', args: ['id'] },
			{ method: 'eq', args: ['email', 'invitee@example.com'] },
			{ method: 'eq', args: ['status', 'approved'] },
			{ method: 'not', args: ['setup_completed_at', 'is', null] },
			{ method: 'or', args: ['setup_user_id.is.null,setup_user_id.eq.invitee-user-1'] },
			{ method: 'limit', args: [1] },
			{ method: 'maybeSingle', args: [] }
		]);
	});

	it('materializes stale pending invitations as expired during resend lookup', async () => {
		const { builder: lookupBuilder } = createPendingInvitationByIdBuilder({
			data: {
				id: 'invite-1',
				email: 'invitee@example.com',
				expires_at: '2000-05-21T12:00:00.000Z'
			}
		});
		const { builder: setupBuilder } = createInvitationAccessRequestSetupLookupBuilder();
		const { builder: expireBuilder, calls: expireCalls } = createInvitationExpiryBuilder();
		const supabase = {
			from: vi.fn().mockReturnValueOnce(lookupBuilder).mockReturnValueOnce(expireBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({ supabase } as never, {
			getAdminClient: () =>
				({
					from: vi.fn(() => setupBuilder)
				}) as never
		});

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

	it('looks up existing User Accounts through the indexed identity table before bridging access requests', async () => {
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
			maybeSingle: (...args: unknown[]) => {
				calls.push({ method: 'maybeSingle', args });
				return {
					data: { user_id: 'user-1', normalized_email: 'user@example.com' },
					error: null
				};
			}
		};
		const adminSupabase = {
			from: vi.fn(() => builder),
			auth: {
				admin: {
					getUserById: vi.fn().mockResolvedValue({
						data: { user: { id: 'user-1', email_confirmed_at: '2026-06-16T12:00:00.000Z' } },
						error: null
					}),
					listUsers: vi.fn()
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
			email: 'user@example.com',
			emailConfirmed: true
		});
		expect(adminSupabase.from).toHaveBeenCalledWith('user_email_identities');
		expect(calls).toContainEqual({ method: 'select', args: ['user_id, normalized_email'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['normalized_email', 'user@example.com'] });
		expect(adminSupabase.auth.admin.getUserById).toHaveBeenCalledWith('user-1');
		expect(adminSupabase.auth.admin.listUsers).not.toHaveBeenCalled();
	});

	it('marks indexed User Accounts as unconfirmed when provider confirmation timestamps are absent', async () => {
		const builder: Record<string, unknown> = {
			select: () => builder,
			eq: () => builder,
			maybeSingle: () => ({
				data: { user_id: 'user-1', normalized_email: 'user@example.com' },
				error: null
			})
		};
		const adminSupabase = {
			from: vi.fn(() => builder),
			auth: {
				admin: {
					getUserById: vi.fn().mockResolvedValue({
						data: { user: { id: 'user-1', email_confirmed_at: null, confirmed_at: null } },
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

		await expect(port.findUserAccountByEmail('user@example.com')).resolves.toEqual({
			id: 'user-1',
			email: 'user@example.com',
			emailConfirmed: false
		});
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
			canManageMembers: false
		});
		expect(supabase.from).toHaveBeenCalledWith('organization_memberships');
		expect(calls).toContainEqual({ method: 'select', args: ['user_id, role, email'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'membership-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] });
	});
});

describe('invitation Access Request bridge', () => {
	const bridgeInput = {
		organizationId: 'org-a',
		invitationId: 'invite-a',
		email: 'invitee@example.com',
		invitedBy: 'owner-a',
		invitedAt: '2026-09-18T12:00:00.000Z',
		role: 'member' as const,
		memberPreset: 'viewer' as const,
		capabilityOverrides: { personnel: 'view' as const },
		accessScopeKind: 'groups' as const,
		accessScopeGroupIds: ['11111111-1111-4111-8111-111111111111']
	};

	function createBridgeClient(response: () => Response) {
		const requests: { path: string; body: unknown }[] = [];
		const client = createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					requests.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) });
					return response();
				}
			}
		});
		const port = createSupabaseOrgSettingsMemberManagementPort({ supabase: { from: vi.fn() } } as never, {
			getAdminClient: () => client
		});
		return { port, requests };
	}

	it('hands the whole invitation snapshot to one database transaction', async () => {
		const { port, requests } = createBridgeClient(() =>
			Response.json({ bridge_status: 'created', access_request_id: 'access-request-1' })
		);

		await expect(port.createOrLinkApprovedAccessRequestForInvitation(bridgeInput)).resolves.toEqual({
			status: 'created',
			accessRequestId: 'access-request-1'
		});
		expect(requests).toEqual([
			{
				path: '/rest/v1/rpc/link_organization_invitation_access_request',
				body: {
					p_invitation_id: 'invite-a',
					p_organization_id: 'org-a',
					p_email: 'invitee@example.com',
					p_invited_by: 'owner-a',
					p_invited_at: '2026-09-18T12:00:00.000Z',
					p_role: 'member',
					p_member_preset: 'viewer',
					p_capability_overrides: { personnel: 'view' },
					p_access_scope_kind: 'groups',
					p_access_scope_group_ids: ['11111111-1111-4111-8111-111111111111']
				}
			}
		]);
	});

	it.each([
		[
			{ bridge_status: 'linked', access_request_id: 'shared-request' },
			{ status: 'linked', accessRequestId: 'shared-request' }
		],
		[
			{ bridge_status: 'already-linked', access_request_id: 'shared-request' },
			{ status: 'already-linked', accessRequestId: 'shared-request' }
		],
		[{ bridge_status: 'invitation-not-pending', access_request_id: null }, { status: 'invitation-not-pending' }],
		[
			{ bridge_status: 'created', access_request_id: null },
			{ status: 'failed', message: 'Access Request link returned an unexpected result' }
		],
		[
			{ bridge_status: null, access_request_id: null },
			{ status: 'failed', message: 'Access Request link returned an unexpected result' }
		]
	])('reads bridge row %j as %j', async (row, expected) => {
		const { port } = createBridgeClient(() => Response.json(row));

		await expect(port.createOrLinkApprovedAccessRequestForInvitation(bridgeInput)).resolves.toEqual(expected);
	});

	it('reports a failed transaction with the database message', async () => {
		const { port } = createBridgeClient(() =>
			Response.json({ message: 'access request store unavailable' }, { status: 500 })
		);

		await expect(port.createOrLinkApprovedAccessRequestForInvitation(bridgeInput)).resolves.toEqual({
			status: 'failed',
			message: 'access request store unavailable'
		});
	});
});

describe('invitation Organization isolation', () => {
	it('cannot resend a foreign Organization invitation or read its privileged setup details', async () => {
		const row = {
			id: 'foreign-invite',
			organization_id: 'org-b',
			status: 'pending',
			email: 'other@example.com',
			expires_at: '2099-01-01T00:00:00.000Z'
		};
		const client = createClient('http://localhost:9', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					expect(init?.method).toBe('GET');
					expect(url.pathname).toBe('/rest/v1/organization_invitations');
					const matches = (['id', 'organization_id', 'status'] as const).every((field) => {
						const filter = url.searchParams.get(field);
						return !filter || filter === `eq.${row[field]}`;
					});
					return matches
						? Response.json(row)
						: Response.json({ code: 'PGRST116', message: 'No matching row' }, { status: 406 });
				}
			}
		});
		const getAdminClient = vi.fn(() => {
			throw new Error('Foreign setup must not be read');
		});
		const port = createSupabaseOrgSettingsMemberManagementPort({ supabase: client }, { getAdminClient });
		expect(await port.findPendingInvitationById('org-a', 'foreign-invite')).toBeNull();
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('blocks only the failed pending invitation while preserving sibling and terminal grants', async () => {
		const rows = [
			{ id: 'failed', organization_id: 'org-a', status: 'pending' },
			{ id: 'sibling', organization_id: 'org-b', status: 'pending' },
			{ id: 'accepted', organization_id: 'org-a', status: 'accepted' }
		];
		const before = structuredClone(rows);
		const client = createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					expect(init?.method).toBe('PATCH');
					expect(url.pathname).toBe('/rest/v1/organization_invitations');
					const selected = rows.filter((row) =>
						(['id', 'organization_id', 'status'] as const).every((field) => {
							const filter = url.searchParams.get(field);
							return !filter || filter === `eq.${row[field]}`;
						})
					);
					if (url.searchParams.get('id') === 'eq.unreachable') {
						return Response.json({ code: '08006', message: 'connection failure' }, { status: 503 });
					}
					for (const row of selected) Object.assign(row, JSON.parse(String(init?.body)));
					return Response.json(selected.map((row) => ({ id: row.id })));
				}
			}
		});
		const port = createSupabaseOrgSettingsMemberManagementPort({ supabase: client }, { getAdminClient: () => client });
		const block = (invitationId: string) =>
			port.blockInvitationAfterAccessRequestBridgeFailure({
				organizationId: 'org-a',
				invitationId,
				blockedBy: 'owner-a',
				reason: 'issuance failed'
			});
		expect(await block('failed')).toEqual({ status: 'blocked' });
		expect(await block('failed')).toEqual({ status: 'not-pending' });
		expect(await block('sibling')).toEqual({ status: 'not-pending' });
		expect(await block('accepted')).toEqual({ status: 'not-pending' });
		expect(await block('unreachable')).toEqual({ status: 'failed', message: 'connection failure' });
		expect(rows[0]).toMatchObject({ id: 'failed', status: 'blocked', blocked_by: 'owner-a' });
		expect(rows.slice(1)).toEqual(before.slice(1));
	});
});

// Interprets PostgREST's documented equality filters against independently stored
// rows. It does not return an arranged success for a particular query chain.
function membershipCohort(
	options: {
		initialRole?: 'member' | 'admin';
		beforeWrite?: (rows: Array<Record<string, unknown>>) => void;
		acknowledgement?: unknown;
		failure?: 'provider' | 'transport';
	} = {}
) {
	const rows: Array<Record<string, unknown>> = [
		{
			id: '11111111-1111-4111-8111-111111111111',
			organization_id: 'org-a',
			role: options.initialRole ?? 'member',
			member_preset: 'viewer',
			capability_overrides: {},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		},
		{
			id: '22222222-2222-4222-8222-222222222222',
			organization_id: 'org-a',
			role: 'owner',
			member_preset: 'editor',
			capability_overrides: {},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		},
		{
			id: '33333333-3333-4333-8333-333333333333',
			organization_id: 'org-b',
			role: 'member',
			member_preset: 'operator',
			capability_overrides: { training: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-b']
		}
	];
	const requests: Array<{ authority: 'ordinary' | 'admin'; method: string }> = [];
	const client = (authority: 'ordinary' | 'admin') =>
		createClient('http://localhost:9', `synthetic-${authority}-key`, {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					expect(url.pathname).toBe('/rest/v1/organization_memberships');
					requests.push({ authority, method: request.method });
					if (options.failure === 'transport') throw new Error('private transport detail');
					if (options.failure === 'provider')
						return Response.json(
							{ code: '42501', message: 'private SQL detail', details: 'private credential' },
							{ status: 403 }
						);
					options.beforeWrite?.(rows);
					const selected = rows.filter((row) =>
						['id', 'organization_id', 'role'].every((field) => {
							const filter = url.searchParams.get(field);
							if (filter === null) return true;
							if (!filter.startsWith('eq.')) throw new Error('Fixture supports documented equality filters only');
							return field === 'id'
								? String(row.id).toLowerCase() === filter.slice(3).toLowerCase()
								: row[field] === filter.slice(3);
						})
					);
					if (request.method === 'PATCH') {
						const changes = await request.json();
						for (const row of selected) Object.assign(row, changes);
					} else if (request.method === 'DELETE') for (const row of selected) rows.splice(rows.indexOf(row), 1);
					else throw new Error('Unexpected mutation method');
					return Response.json(
						'acknowledgement' in options ? options.acknowledgement : selected.map((row) => ({ id: row.id }))
					);
				}
			}
		});
	const port = createSupabaseOrgSettingsMemberManagementPort(
		{ supabase: client('ordinary') },
		{ getAdminClient: () => client('admin') }
	);
	return { rows, requests, port };
}

const guardedMembershipId = '11111111-1111-4111-8111-111111111111';
function mutateMembership(
	port: ReturnType<typeof membershipCohort>['port'],
	method: 'update' | 'remove',
	expectedRole: 'member' | 'admin',
	membershipId = guardedMembershipId
) {
	return method === 'remove'
		? port.removeMembership('org-a', membershipId, expectedRole)
		: port.updateMembership({
				organizationId: 'org-a',
				membershipId,
				expectedRole,
				role: 'member',
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['44444444-4444-4444-8444-444444444444']
			});
}

describe('ordinary membership role and acknowledgement guards', () => {
	it('acknowledges the exact UUID independently of its submitted letter case', async () => {
		const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
		for (const method of ['update', 'remove'] as const) {
			const { port, rows } = membershipCohort();
			rows[0].id = id;
			expect(await mutateMembership(port, method, 'member', id.toUpperCase())).toBeNull();
			if (method === 'update') expect(rows[0]).toMatchObject({ id, member_preset: 'operator' });
			else expect(rows.some((row) => row.id === id)).toBe(false);
		}
	});
	it.each(['member', 'admin'] as const)('allows acknowledged %s mutations and preserves the cohort', async (role) => {
		for (const method of ['update', 'remove'] as const) {
			const { port, rows, requests } = membershipCohort({ initialRole: role });
			const neighbors = structuredClone(rows.slice(1));
			expect(await mutateMembership(port, method, role)).toBeNull();
			expect(rows.filter((row) => row.id !== guardedMembershipId)).toEqual(neighbors);
			if (method === 'update')
				expect(rows[0]).toEqual({
					id: guardedMembershipId,
					organization_id: 'org-a',
					role: 'member',
					member_preset: 'operator',
					capability_overrides: { calendar: 'configure', ratingScheme: 'none' },
					access_scope_kind: 'groups',
					access_scope_group_ids: ['44444444-4444-4444-8444-444444444444']
				});
			else expect(rows.some((row) => row.id === guardedMembershipId)).toBe(false);
			expect(requests).toEqual([
				{ authority: method === 'remove' ? 'admin' : 'ordinary', method: method === 'remove' ? 'DELETE' : 'PATCH' }
			]);
		}
	});
	it.each([
		['member', 'owner'],
		['member', 'admin'],
		['admin', 'owner'],
		['admin', 'member']
	] as const)('refuses final writes when the authorized %s becomes %s', async (expectedRole, lateRole) => {
		for (const method of ['update', 'remove'] as const) {
			const { port, rows } = membershipCohort({
				initialRole: expectedRole,
				beforeWrite: (cohort) => {
					Object.assign(cohort[0], {
						role: lateRole,
						member_preset: lateRole === 'member' ? 'operator' : 'editor',
						capability_overrides: {},
						access_scope_kind: 'organization',
						access_scope_group_ids: []
					});
				}
			});
			const expected = structuredClone(rows);
			Object.assign(expected[0], {
				role: lateRole,
				member_preset: lateRole === 'member' ? 'operator' : 'editor',
				capability_overrides: {},
				access_scope_kind: 'organization',
				access_scope_group_ids: []
			});
			expect(await mutateMembership(port, method, expectedRole)).toBe(
				method === 'remove' ? 'Membership could not be removed' : 'Membership access could not be updated'
			);
			expect(rows).toEqual(expected);
		}
	});
	it.each(['update', 'remove'] as const)('cannot %s a foreign or absent membership', async (method) => {
		const { port, rows } = membershipCohort();
		const before = structuredClone(rows);
		for (const membershipId of ['33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555']) {
			expect(await mutateMembership(port, method, 'member', membershipId)).not.toBeNull();
			expect(rows).toEqual(before);
		}
	});
	it.each([
		null,
		[],
		[{ id: '33333333-3333-4333-8333-333333333333' }],
		[{ id: guardedMembershipId }, { id: guardedMembershipId }],
		{ id: guardedMembershipId }
	])('does not acknowledge unexpected selected rows %#', async (acknowledgement) => {
		for (const method of ['update', 'remove'] as const) {
			const { port } = membershipCohort({ acknowledgement });
			expect(await mutateMembership(port, method, 'member')).toBe(
				method === 'remove' ? 'Membership could not be removed' : 'Membership access could not be updated'
			);
		}
	});
	it.each(['provider', 'transport'] as const)('reports safe %s failure without changing records', async (failure) => {
		for (const method of ['update', 'remove'] as const) {
			const { port, rows } = membershipCohort({ failure });
			const before = structuredClone(rows);
			expect(await mutateMembership(port, method, 'member')).toBe(
				method === 'remove' ? 'Membership could not be removed' : 'Membership access could not be updated'
			);
			expect(rows).toEqual(before);
		}
	});
	it.each(['owner', null, 'unknown'])(
		'rejects a noneditable expected role %# before a provider request',
		async (role) => {
			const { port, rows, requests } = membershipCohort();
			const before = structuredClone(rows);
			for (const method of ['update', 'remove'] as const)
				expect(await mutateMembership(port, method, role as never)).not.toBeNull();
			expect(requests).toEqual([]);
			expect(rows).toEqual(before);
		}
	);
});
