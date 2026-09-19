import { createClient } from '@supabase/supabase-js';
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

function createMembershipUpdateBuilder(result: { error: { message: string } | null }) {
	const calls: Call[] = [];
	let eqCount = 0;

	const builder: Record<string, unknown> = {
		update: (...args: unknown[]) => {
			calls.push({ method: 'update', args });
			return builder;
		},
		eq: (...args: unknown[]) => {
			calls.push({ method: 'eq', args });
			eqCount += 1;
			return eqCount >= 2 ? result : builder;
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

function createAccessRequestApprovalBuilder(result: { error: { message: string } | null } = { error: null }) {
	const calls: Call[] = [];
	let eqCount = 0;

	const builder: Record<string, unknown> = {
		update: (...args: unknown[]) => {
			calls.push({ method: 'update', args });
			return builder;
		},
		eq: (...args: unknown[]) => {
			calls.push({ method: 'eq', args });
			eqCount += 1;
			return eqCount >= 2 ? result : builder;
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

	it('creates a pending Access Request and stores the originating Organization Invitation context for non-users', async () => {
		const { builder: lookupBuilder, calls: lookupCalls } = createAccessRequestLookupBuilder({
			data: null,
			error: null
		});
		const { builder: approvedLookupBuilder, calls: approvedLookupCalls } = createAccessRequestLookupBuilder({
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
		const { builder: approvalBuilder } = createAccessRequestApprovalBuilder();
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(lookupBuilder)
				.mockReturnValueOnce(approvedLookupBuilder)
				.mockReturnValueOnce(requestInsertBuilder)
				.mockReturnValueOnce(linkInsertBuilder)
				.mockReturnValueOnce(approvalBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		const result = await port.createOrLinkApprovedAccessRequestForInvitation({
			organizationId: 'org-1',
			invitationId: 'invite-1',
			email: 'Invitee@Example.com',
			invitedBy: 'owner-1',
			invitedAt: '2026-05-22T12:00:00.000Z',
			role: 'member',
			memberPreset: 'viewer',
			capabilityOverrides: { personnel: 'view' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['11111111-1111-4111-8111-111111111111']
		});

		expect(result).toEqual({ status: 'created', accessRequestId: 'access-request-1' });
		expect(adminSupabase.from).toHaveBeenNthCalledWith(1, 'access_requests');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(2, 'access_requests');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(3, 'access_requests');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(4, 'access_request_organization_invitation_links');
		expect(adminSupabase.from).toHaveBeenNthCalledWith(5, 'access_requests');
		expect(lookupCalls).toContainEqual({ method: 'eq', args: ['email', 'invitee@example.com'] });
		expect(lookupCalls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(approvedLookupCalls).toContainEqual({ method: 'eq', args: ['email', 'invitee@example.com'] });
		expect(approvedLookupCalls).toContainEqual({ method: 'eq', args: ['status', 'approved'] });
		expect(approvedLookupCalls).toContainEqual({ method: 'is', args: ['setup_completed_at', null] });
		expect(approvedLookupCalls).toContainEqual({
			method: 'or',
			args: [expect.stringContaining('and(reviewed_at.is.null,created_at.gte."')]
		});
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
		const { builder: approvalBuilder, calls: approvalCalls } = createAccessRequestApprovalBuilder();
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(lookupBuilder)
				.mockReturnValueOnce(linkInsertBuilder)
				.mockReturnValueOnce(approvalBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkApprovedAccessRequestForInvitation({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				email: 'pending@example.com',
				invitedBy: 'owner-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({ status: 'linked', accessRequestId: 'pending-request-1' });

		expect(adminSupabase.from).toHaveBeenCalledTimes(3);
		expect(adminSupabase.from).not.toHaveBeenNthCalledWith(2, 'access_requests');
		// A pre-existing pending public request is auto-approved on the inviter's vouching too.
		expect(approvalCalls).toContainEqual({ method: 'eq', args: ['id', 'pending-request-1'] });
		expect(approvalCalls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
	});

	it('links an approved incomplete Access Request to the new Organization Invitation without inserting a duplicate pending request', async () => {
		const { builder: pendingLookupBuilder } = createAccessRequestLookupBuilder({
			data: null,
			error: null
		});
		const { builder: approvedLookupBuilder, calls: approvedLookupCalls } = createAccessRequestLookupBuilder({
			data: { id: 'approved-request-1' },
			error: null
		});
		const { builder: linkInsertBuilder } = createInvitationAccessRequestLinkInsertBuilder({ error: null });
		const { builder: approvalBuilder } = createAccessRequestApprovalBuilder();
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(pendingLookupBuilder)
				.mockReturnValueOnce(approvedLookupBuilder)
				.mockReturnValueOnce(linkInsertBuilder)
				.mockReturnValueOnce(approvalBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkApprovedAccessRequestForInvitation({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				email: ' Approved@Example.com \t',
				invitedBy: 'owner-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({ status: 'linked', accessRequestId: 'approved-request-1' });

		expect(adminSupabase.from).toHaveBeenCalledTimes(4);
		expect(approvedLookupCalls).toEqual([
			{ method: 'select', args: ['id'] },
			{ method: 'eq', args: ['email', 'approved@example.com'] },
			{ method: 'eq', args: ['status', 'approved'] },
			{ method: 'is', args: ['setup_completed_at', null] },
			{
				method: 'or',
				args: [expect.stringContaining('and(reviewed_at.is.null,created_at.gte."')]
			},
			{ method: 'order', args: ['reviewed_at', { ascending: false, nullsFirst: false }] },
			{ method: 'order', args: ['created_at', { ascending: false }] },
			{ method: 'limit', args: [1] },
			{ method: 'maybeSingle', args: [] }
		]);
		expect(adminSupabase.from).not.toHaveBeenNthCalledWith(3, 'access_requests');
	});

	it('inserts the invite-origin Access Request pending and then flips it to approved for the inviter', async () => {
		const { builder: pendingLookupBuilder } = createAccessRequestLookupBuilder({ data: null, error: null });
		const { builder: approvedLookupBuilder } = createAccessRequestLookupBuilder({ data: null, error: null });
		const { builder: requestInsertBuilder, calls: requestInsertCalls } = createAccessRequestInsertBuilder({
			data: { id: 'access-request-1' },
			error: null
		});
		const { builder: linkInsertBuilder } = createInvitationAccessRequestLinkInsertBuilder({ error: null });
		const { builder: approvalBuilder, calls: approvalCalls } = createAccessRequestApprovalBuilder();
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(pendingLookupBuilder)
				.mockReturnValueOnce(approvedLookupBuilder)
				.mockReturnValueOnce(requestInsertBuilder)
				.mockReturnValueOnce(linkInsertBuilder)
				.mockReturnValueOnce(approvalBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkApprovedAccessRequestForInvitation({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				email: 'invitee@example.com',
				invitedBy: 'owner-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({ status: 'created', accessRequestId: 'access-request-1' });

		// Born pending: access_requests_pending_email_idx only covers pending rows, and it is
		// the only serialization point two simultaneous invites to one email have.
		expect(requestInsertCalls[0].args[0]).not.toHaveProperty('status');
		expect(approvalCalls).toEqual([
			{
				method: 'update',
				args: [
					{
						status: 'approved',
						reviewed_by: 'owner-1',
						reviewed_at: expect.any(String)
					}
				]
			},
			{ method: 'eq', args: ['id', 'access-request-1'] },
			{ method: 'eq', args: ['status', 'pending'] }
		]);
	});

	it('fails the bridge when the approval flip errors', async () => {
		const { builder: pendingLookupBuilder } = createAccessRequestLookupBuilder({
			data: { id: 'pending-request-1' },
			error: null
		});
		const { builder: linkInsertBuilder } = createInvitationAccessRequestLinkInsertBuilder({ error: null });
		const { builder: approvalBuilder } = createAccessRequestApprovalBuilder({
			error: { message: 'access request store unavailable' }
		});
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(pendingLookupBuilder)
				.mockReturnValueOnce(linkInsertBuilder)
				.mockReturnValueOnce(approvalBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkApprovedAccessRequestForInvitation({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				email: 'invitee@example.com',
				invitedBy: 'owner-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({ status: 'failed', message: 'access request store unavailable' });
	});

	it('recovers from a losing pending-email insert by reusing a request another writer already approved', async () => {
		const { builder: pendingLookupBuilder } = createAccessRequestLookupBuilder({ data: null, error: null });
		const { builder: approvedLookupBuilder } = createAccessRequestLookupBuilder({ data: null, error: null });
		const { builder: requestInsertBuilder } = createAccessRequestInsertBuilder({
			data: null,
			error: {
				code: '23505',
				message: 'duplicate key value violates unique constraint "access_requests_pending_email_idx"'
			}
		});
		const { builder: retryPendingLookupBuilder } = createAccessRequestLookupBuilder({ data: null, error: null });
		const { builder: retryApprovedLookupBuilder } = createAccessRequestLookupBuilder({
			data: { id: 'winner-request-1' },
			error: null
		});
		const { builder: linkInsertBuilder, calls: linkInsertCalls } = createInvitationAccessRequestLinkInsertBuilder({
			error: null
		});
		const { builder: approvalBuilder } = createAccessRequestApprovalBuilder();
		const adminSupabase = {
			from: vi
				.fn()
				.mockReturnValueOnce(pendingLookupBuilder)
				.mockReturnValueOnce(approvedLookupBuilder)
				.mockReturnValueOnce(requestInsertBuilder)
				.mockReturnValueOnce(retryPendingLookupBuilder)
				.mockReturnValueOnce(retryApprovedLookupBuilder)
				.mockReturnValueOnce(linkInsertBuilder)
				.mockReturnValueOnce(approvalBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkApprovedAccessRequestForInvitation({
				organizationId: 'org-2',
				invitationId: 'invite-2',
				email: 'invitee@example.com',
				invitedBy: 'owner-2',
				invitedAt: '2026-05-22T12:00:01.000Z',
				role: 'member',
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({ status: 'linked', accessRequestId: 'winner-request-1' });

		expect(adminSupabase.from).toHaveBeenCalledTimes(7);
		// The losing writer's own Organization Invitation still lands on the shared request.
		expect(linkInsertCalls).toEqual([
			{
				method: 'insert',
				args: [
					expect.objectContaining({
						access_request_id: 'winner-request-1',
						organization_invitation_id: 'invite-2',
						organization_id: 'org-2',
						invited_by: 'owner-2'
					})
				]
			}
		]);
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

	it('uses the serialized member-plan guard RPC for post-create cap enforcement', async () => {
		const adminSupabase = {
			rpc: vi.fn(async () => ({ data: true, error: null }))
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.blockInvitationIfMemberPlanLimitExceeded({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				blockedBy: 'owner-1',
				memberLimit: 2,
				reason: 'plan_member_limit_overcap'
			})
		).resolves.toEqual({ status: 'blocked' });

		expect(adminSupabase.rpc).toHaveBeenCalledWith('block_invitation_if_member_cap_exceeded', {
			p_org_id: 'org-1',
			p_invitation_id: 'invite-1',
			p_blocked_by: 'owner-1',
			p_member_limit: 2,
			p_block_reason: 'plan_member_limit_overcap'
		});
	});

	it('does not swallow unrelated unique constraint failures while creating invite-origin Access Requests', async () => {
		const { builder: lookupBuilder } = createAccessRequestLookupBuilder({
			data: null,
			error: null
		});
		const { builder: approvedLookupBuilder } = createAccessRequestLookupBuilder({
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
			from: vi
				.fn()
				.mockReturnValueOnce(lookupBuilder)
				.mockReturnValueOnce(approvedLookupBuilder)
				.mockReturnValueOnce(requestInsertBuilder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort(
			{
				supabase: { from: vi.fn() }
			} as never,
			{ getAdminClient: () => adminSupabase as never }
		);

		await expect(
			port.createOrLinkApprovedAccessRequestForInvitation({
				organizationId: 'org-1',
				invitationId: 'invite-1',
				email: 'pending@example.com',
				invitedBy: 'owner-1',
				invitedAt: '2026-05-22T12:00:00.000Z',
				role: 'member',
				memberPreset: 'viewer',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			})
		).resolves.toEqual({
			status: 'failed',
			message: 'duplicate key value violates unique constraint "some_other_unique_idx"'
		});
		expect(adminSupabase.from).toHaveBeenCalledTimes(3);
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

	it('updates memberships through replacement member-access storage only', async () => {
		const { builder, calls } = createMembershipUpdateBuilder({ error: null });
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseOrgSettingsMemberManagementPort({
			supabase
		} as never);

		await expect(
			port.updateMembership({
				organizationId: 'org-1',
				membershipId: 'membership-1',
				role: 'member',
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
			})
		).resolves.toBeNull();

		expect(supabase.from).toHaveBeenCalledWith('organization_memberships');
		expect(calls).toEqual([
			{
				method: 'update',
				args: [
					{
						role: 'member',
						member_preset: 'operator',
						capability_overrides: { calendar: 'configure', ratingScheme: 'none' },
						access_scope_kind: 'groups',
						access_scope_group_ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
					}
				]
			},
			{ method: 'eq', args: ['id', 'membership-1'] },
			{ method: 'eq', args: ['organization_id', 'org-1'] }
		]);
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

describe('invitation approval provenance', () => {
	it.each(['pending', 'approved'] as const)(
		'bridges a %s request without overwriting independent approvals or other identities',
		async (status) => {
			const rows = [
				{
					id: 'target',
					email: 'invitee@example.com',
					status,
					reviewed_by: status === 'approved' ? 'platform-reviewer' : null,
					reviewed_at: status === 'approved' ? '2026-09-18T10:00:00.000Z' : null
				},
				{
					id: 'other-approved',
					email: 'other@example.com',
					status: 'approved',
					reviewed_by: 'independent-reviewer',
					reviewed_at: '2026-09-18T09:00:00.000Z'
				},
				{ id: 'other-pending', email: 'waiting@example.com', status: 'pending', reviewed_by: null, reviewed_at: null }
			];
			const before = structuredClone(rows);
			const links: unknown[] = [];
			const client = createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (input, init) => {
						const url = new URL(String(input));
						if (url.pathname === '/rest/v1/access_request_organization_invitation_links' && init?.method === 'POST') {
							links.push(JSON.parse(String(init.body)));
							return new Response(null, { status: 201 });
						}
						expect(url.pathname).toBe('/rest/v1/access_requests');
						const selected = rows.filter((row) =>
							(['id', 'email', 'status'] as const).every((field) => {
								const filter = url.searchParams.get(field);
								return !filter || filter === `eq.${row[field]}`;
							})
						);
						if (init?.method === 'GET') return Response.json(selected.map((row) => ({ id: row.id })));
						expect(init?.method).toBe('PATCH');
						for (const row of selected) Object.assign(row, JSON.parse(String(init?.body)));
						return new Response(null, { status: 204 });
					}
				}
			});
			const port = createSupabaseOrgSettingsMemberManagementPort(
				{ supabase: client },
				{ getAdminClient: () => client }
			);
			expect(
				await port.createOrLinkApprovedAccessRequestForInvitation({
					organizationId: 'org-a',
					invitationId: 'invite-a',
					email: ' INVITEE@EXAMPLE.COM ',
					invitedBy: 'owner-a',
					invitedAt: '2026-09-18T12:00:00.000Z',
					role: 'member',
					memberPreset: 'viewer',
					capabilityOverrides: {},
					accessScopeKind: 'groups',
					accessScopeGroupIds: ['group-a']
				})
			).toEqual({ status: 'linked', accessRequestId: 'target' });
			expect(rows.slice(1)).toEqual(before.slice(1));
			if (status === 'approved') expect(rows[0]).toEqual(before[0]);
			else
				expect(rows[0]).toMatchObject({ status: 'approved', reviewed_by: 'owner-a', reviewed_at: expect.any(String) });
			expect(links).toEqual([
				expect.objectContaining({
					access_request_id: 'target',
					organization_id: 'org-a',
					organization_invitation_id: 'invite-a'
				})
			]);
		}
	);
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
					for (const row of selected) Object.assign(row, JSON.parse(String(init?.body)));
					return selected.length === 1
						? Response.json({ id: selected[0].id })
						: Response.json({ code: 'PGRST116', message: 'No matching row' }, { status: 406 });
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
		expect(await block('sibling')).toMatchObject({ status: 'failed' });
		expect(await block('accepted')).toMatchObject({ status: 'failed' });
		expect(rows[0]).toMatchObject({ id: 'failed', status: 'blocked', blocked_by: 'owner-a' });
		expect(rows.slice(1)).toEqual(before.slice(1));
	});
});
