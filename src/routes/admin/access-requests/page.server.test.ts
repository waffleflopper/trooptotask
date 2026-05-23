import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const {
	createServiceMock,
	createStoreMock,
	createOutboxStoreMock,
	sendSetupEmailMock,
	sendOutboxDeliveryMock,
	notifyAdminsMock
} = vi.hoisted(() => ({
	createServiceMock: vi.fn(),
	createStoreMock: vi.fn(),
	createOutboxStoreMock: vi.fn(),
	sendSetupEmailMock: vi.fn(),
	sendOutboxDeliveryMock: vi.fn(),
	notifyAdminsMock: vi.fn()
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/accountSetupLinks', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/accountSetupLinks')>();
	return {
		...actual,
		createAccountSetupLinkService: createServiceMock,
		createSupabaseAccountSetupLinkStore: createStoreMock,
		sendAccountSetupLinkEmail: sendSetupEmailMock
	};
});

vi.mock('$lib/server/authEmailOutbox', () => ({
	createSupabaseAuthEmailOutboxStore: createOutboxStoreMock,
	sendAccountSetupOutboxDelivery: sendOutboxDeliveryMock
}));

vi.mock('$lib/server/notifications', () => ({
	notifyAdmins: notifyAdminsMock
}));

import { actions, load } from './+page.server';

function makeRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/admin/access-requests', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

function makeSelectAccessRequest(accessRequest: Record<string, unknown>) {
	const single = vi.fn().mockResolvedValue({ data: accessRequest, error: null });
	const eqStatus = vi.fn(() => ({ single }));
	const eqId = vi.fn(() => ({ eq: eqStatus }));
	const select = vi.fn(() => ({ eq: eqId }));

	return { select, eqId, eqStatus, single };
}

function makeUpdateAccessRequest() {
	const eq = vi.fn().mockResolvedValue({ error: null });
	const update = vi.fn(() => ({ eq }));

	return { update, eq };
}

function makeAdminClient(
	parts: { select?: unknown; update?: unknown; rpc?: unknown; inviteUserByEmail?: unknown } = {}
) {
	const from = vi.fn((table: string) => {
		if (table === 'access_requests') {
			return {
				select: parts.select,
				update: parts.update
			};
		}

		throw new Error(`Unexpected table ${table}`);
	});

	return {
		from,
		rpc: parts.rpc ?? vi.fn(),
		auth: {
			admin: {
				inviteUserByEmail: parts.inviteUserByEmail ?? vi.fn()
			}
		}
	};
}

function makeLoadAdminClient(rows: Record<string, unknown>[]) {
	const range = vi.fn().mockResolvedValue({ data: rows, error: null });
	const order = vi.fn(() => ({ range }));
	const select = vi.fn(() => ({ order }));
	const profileIn = vi.fn().mockResolvedValue({ data: [], error: null });
	const profileSelect = vi.fn(() => ({ in: profileIn }));
	const from = vi.fn((table: string) => {
		if (table === 'access_requests') return { select };
		if (table === 'user_profiles') return { select: profileSelect };
		throw new Error(`Unexpected table ${table}`);
	});

	return { client: { from, auth: { admin: { getUserById: vi.fn() } } }, select, range, profileIn };
}

function makeContext(adminClient: unknown) {
	return {
		adminClient,
		adminUser: { id: 'admin-1', role: 'super_admin' },
		audit: vi.fn()
	};
}

function makeAccessRequestRow(overrides: Record<string, unknown>) {
	return {
		id: 'request-1',
		name: 'Test Soldier',
		email: 'soldier@example.mil',
		reason: 'Needs beta access',
		heard_about: 'other',
		heard_about_details: null,
		status: 'approved',
		created_at: '2026-05-18T12:00:00.000Z',
		reviewed_at: '2026-05-18T13:00:00.000Z',
		setup_completed_at: null,
		account_setup_links: null,
		auth_email_outbox: null,
		access_request_organization_invitation_links: null,
		...overrides
	};
}

function makeSetupLink(overrides: Record<string, unknown>) {
	return {
		id: 'link-1',
		created_at: '2026-05-18T13:00:00.000Z',
		expires_at: '2099-06-01T12:00:00.000Z',
		claimed_at: null,
		failed_at: null,
		failure_reason: null,
		used_at: null,
		revoked_at: null,
		revocation_reason: null,
		...overrides
	};
}

function makeOutbox(overrides: Record<string, unknown>) {
	return {
		id: 'outbox-1',
		setup_link_id: 'link-1',
		status: 'sent',
		attempt_count: 1,
		last_error: null,
		created_at: '2026-05-18T13:01:00.000Z',
		updated_at: '2026-05-18T13:01:00.000Z',
		sent_at: '2026-05-18T13:01:00.000Z',
		...overrides
	};
}

describe('admin access request account setup delivery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		createStoreMock.mockReturnValue({ store: 'account-setup-store' });
		createOutboxStoreMock.mockReturnValue({ store: 'auth-email-outbox-store' });
		sendSetupEmailMock.mockResolvedValue(undefined);
		notifyAdminsMock.mockResolvedValue(undefined);
		sendOutboxDeliveryMock.mockResolvedValue({
			status: 'sent',
			outbox: { id: 'outbox-1', status: 'sent' }
		});
	});

	it('summarizes setup support states from setup links and delivery records', async () => {
		const rows = [
			makeAccessRequestRow({ id: 'not-sent', account_setup_links: null, auth_email_outbox: null }),
			makeAccessRequestRow({
				id: 'delivery-pending',
				account_setup_links: [makeSetupLink({ id: 'link-delivery-pending' })],
				auth_email_outbox: [
					makeOutbox({ id: 'outbox-delivery-pending', setup_link_id: 'link-delivery-pending', status: 'pending' })
				]
			}),
			makeAccessRequestRow({
				id: 'delivery-failed',
				account_setup_links: [makeSetupLink({ id: 'link-delivery-failed' })],
				auth_email_outbox: [
					makeOutbox({
						id: 'outbox-delivery-failed',
						setup_link_id: 'link-delivery-failed',
						status: 'failed',
						last_error: 'mail provider unavailable',
						sent_at: null
					})
				]
			}),
			makeAccessRequestRow({
				id: 'setup-pending',
				account_setup_links: [makeSetupLink({ id: 'link-pending' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-pending' })]
			}),
			makeAccessRequestRow({
				id: 'expired',
				account_setup_links: [makeSetupLink({ id: 'link-expired', expires_at: '2020-06-01T12:00:00.000Z' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-expired' })]
			}),
			makeAccessRequestRow({
				id: 'expired-delivery-failed',
				account_setup_links: [
					makeSetupLink({ id: 'link-expired-delivery-failed', expires_at: '2020-06-01T12:00:00.000Z' })
				],
				auth_email_outbox: [
					makeOutbox({
						setup_link_id: 'link-expired-delivery-failed',
						status: 'failed',
						last_error: 'mail provider unavailable',
						sent_at: null
					})
				]
			}),
			makeAccessRequestRow({
				id: 'replaced',
				account_setup_links: [
					makeSetupLink({
						id: 'link-replaced',
						revoked_at: '2026-05-19T12:00:00.000Z',
						revocation_reason: 'replaced'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-replaced' })]
			}),
			makeAccessRequestRow({
				id: 'manual-revoked',
				account_setup_links: [
					makeSetupLink({
						id: 'link-manual-revoked',
						revoked_at: '2026-05-19T12:00:00.000Z',
						revocation_reason: 'manual'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-manual-revoked' })]
			}),
			makeAccessRequestRow({
				id: 'cleanup-revoked',
				account_setup_links: [
					makeSetupLink({
						id: 'link-cleanup-revoked',
						revoked_at: '2026-05-19T12:00:00.000Z',
						revocation_reason: 'cleanup'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-cleanup-revoked' })]
			}),
			makeAccessRequestRow({
				id: 'claimed',
				account_setup_links: [makeSetupLink({ id: 'link-claimed', claimed_at: '2026-05-19T12:00:00.000Z' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-claimed' })]
			}),
			makeAccessRequestRow({
				id: 'failed',
				account_setup_links: [
					makeSetupLink({
						id: 'link-failed',
						claimed_at: '2026-05-19T12:00:00.000Z',
						failed_at: '2026-05-19T12:05:00.000Z',
						failure_reason: 'account-create-failed'
					})
				],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-failed' })]
			}),
			makeAccessRequestRow({
				id: 'completed',
				setup_completed_at: '2026-05-20T12:00:00.000Z',
				account_setup_links: [makeSetupLink({ id: 'link-completed', used_at: '2026-05-20T12:00:00.000Z' })],
				auth_email_outbox: [makeOutbox({ setup_link_id: 'link-completed' })]
			})
		];
		const { client, select } = makeLoadAdminClient(rows);

		const result = (await load({
			__ctx: makeContext(client)
		} as unknown as Parameters<typeof load>[0])) as PageData;
		const reviewedById = Object.fromEntries(result.reviewed.map((request) => [request.id, request]));

		expect(select).toHaveBeenCalledWith(expect.stringContaining('claimed_at'));
		expect(select).toHaveBeenCalledWith(expect.stringContaining('failed_at'));
		expect(select).toHaveBeenCalledWith(expect.stringContaining('failure_reason'));
		expect(select).toHaveBeenCalledWith(expect.stringContaining('auth_email_outbox'));
		expect(
			Object.fromEntries(Object.entries(reviewedById).map(([id, request]) => [id, request.setup_state]))
		).toMatchObject({
			'not-sent': 'not_sent',
			'delivery-pending': 'delivery_pending',
			'delivery-failed': 'delivery_failed',
			'setup-pending': 'pending',
			expired: 'expired',
			'expired-delivery-failed': 'expired',
			replaced: 'replaced',
			'manual-revoked': 'replaced',
			'cleanup-revoked': 'replaced',
			claimed: 'claimed',
			failed: 'failed',
			completed: 'completed'
		});
		expect(reviewedById.failed).toMatchObject({
			setup_link_id: 'link-failed',
			setup_link_failed_at: '2026-05-19T12:05:00.000Z',
			setup_link_failure_reason: 'account-create-failed'
		});
		expect(reviewedById['delivery-failed']).toMatchObject({
			setup_delivery_id: 'outbox-delivery-failed',
			setup_delivery_last_error: 'mail provider unavailable'
		});
		expect(reviewedById.replaced).toMatchObject({
			setup_state_label: 'Replaced',
			setup_state_detail: 'The latest known setup link was replaced by a newer setup email.',
			setup_link_revocation_reason: 'replaced'
		});
		expect(reviewedById['manual-revoked']).toMatchObject({
			setup_state_label: 'Revoked manually',
			setup_state_detail:
				'The latest known setup link was manually revoked. Send a fresh setup link if setup is still needed.',
			setup_link_revocation_reason: 'manual'
		});
		expect(reviewedById['cleanup-revoked']).toMatchObject({
			setup_state_label: 'Revoked by cleanup',
			setup_state_detail:
				'The latest known setup link was revoked by cleanup after it expired. Send a fresh setup link if setup is still needed.',
			setup_link_revocation_reason: 'cleanup'
		});
		expect(JSON.stringify(result)).not.toContain('token=');
		expect(JSON.stringify(result)).not.toContain('/auth/setup-account');
	});

	it('server-shapes organization invitation origin context for platform review', async () => {
		const rows = [
			makeAccessRequestRow({
				id: 'invite-origin',
				status: 'pending',
				access_request_organization_invitation_links: [
					{
						id: 'link-1',
						organization_invitation_id: 'invite-1',
						organization_id: 'org-1',
						invited_by: '11111111-1111-4111-8111-111111111111',
						invited_at: '2026-05-18T13:00:00.000Z',
						intended_membership_role: 'member',
						intended_member_preset: 'viewer',
						organizations: { id: 'org-1', name: 'Alpha Company' }
					}
				]
			}),
			makeAccessRequestRow({
				id: 'ordinary',
				status: 'pending',
				access_request_organization_invitation_links: null
			})
		];
		const getUserById = vi.fn().mockResolvedValue({
			data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'leader@example.mil' } },
			error: null
		});
		const { client, select, profileIn } = makeLoadAdminClient(rows);
		profileIn.mockResolvedValue({
			data: [{ user_id: '11111111-1111-4111-8111-111111111111', first_name: 'Avery', last_name: 'Jones' }],
			error: null
		});
		const ctx = makeContext({
			...client,
			auth: { admin: { getUserById } }
		});

		const result = (await load({
			__ctx: ctx
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(select).toHaveBeenCalledWith(expect.stringContaining('access_request_organization_invitation_links'));
		expect(result.pending.find((request) => request.id === 'invite-origin')?.invitation_origins).toEqual([
			expect.objectContaining({
				link_id: 'link-1',
				invitation_id: 'invite-1',
				organization_id: 'org-1',
				organization_name: 'Alpha Company',
				inviter_user_id: '11111111-1111-4111-8111-111111111111',
				inviter_label: 'Avery Jones',
				invited_at: '2026-05-18T13:00:00.000Z',
				membership_role_label: 'Member',
				member_preset_label: 'Viewer',
				intended_access_label: 'Member preset: Viewer'
			})
		]);
		expect(result.pending.find((request) => request.id === 'ordinary')?.invitation_origins).toEqual([]);
	});

	it('approving a pending request creates and emails an app-owned Account Setup Link without Supabase invite delivery', async () => {
		const accessRequest = {
			id: 'request-1',
			email: 'Soldier@Example.mil',
			status: 'pending'
		};
		const selectAccessRequest = makeSelectAccessRequest(accessRequest);
		const updateAccessRequest = makeUpdateAccessRequest();
		const inviteUserByEmail = vi.fn();
		const adminClient = makeAdminClient({
			select: selectAccessRequest.select,
			update: updateAccessRequest.update,
			inviteUserByEmail
		});
		const createForAccessRequest = vi.fn().mockResolvedValue({
			status: 'created',
			accessRequestId: 'request-1',
			setupPath: '/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-01T12:00:00.000Z'),
			link: { id: 'link-1' }
		});
		createServiceMock.mockReturnValue({ createForAccessRequest });
		const ctx = makeContext(adminClient);

		const result = await actions.approve({
			__ctx: ctx,
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('http://localhost/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['approve']>[0]);

		expect(result).toEqual({ success: true, action: 'approve', setupDeliveryStatus: 'sent' });
		expect(updateAccessRequest.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'approved',
				reviewed_by: 'admin-1'
			})
		);
		expect(createForAccessRequest).toHaveBeenCalledWith('request-1');
		expect(sendOutboxDeliveryMock).toHaveBeenCalledWith({ store: 'auth-email-outbox-store' }, sendSetupEmailMock, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-1',
			email: 'Soldier@Example.mil',
			setupUrl: 'http://localhost/auth/setup-account?token=raw-token',
			expiresAt: new Date('2026-06-01T12:00:00.000Z')
		});
		expect(inviteUserByEmail).not.toHaveBeenCalled();
		expect((ctx.audit as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event.action)).toEqual([
			'access_request.approved',
			'access_request.account_setup_link_sent'
		]);
	});

	it('keeps an approved request approved when Account Setup email delivery fails', async () => {
		const accessRequest = {
			id: 'request-1',
			email: 'Soldier@Example.mil',
			status: 'pending'
		};
		const selectAccessRequest = makeSelectAccessRequest(accessRequest);
		const updateAccessRequest = makeUpdateAccessRequest();
		const adminClient = makeAdminClient({
			select: selectAccessRequest.select,
			update: updateAccessRequest.update
		});
		createServiceMock.mockReturnValue({
			createForAccessRequest: vi.fn().mockResolvedValue({
				status: 'created',
				accessRequestId: 'request-1',
				setupPath: '/auth/setup-account?token=raw-token',
				expiresAt: new Date('2026-06-01T12:00:00.000Z'),
				link: { id: 'link-1' }
			})
		});
		sendOutboxDeliveryMock.mockResolvedValueOnce({
			status: 'failed',
			error: 'mail provider unavailable',
			outbox: { id: 'outbox-1', status: 'failed' }
		});
		const ctx = makeContext(adminClient);

		const result = await actions.approve({
			__ctx: ctx,
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('http://localhost/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['approve']>[0]);

		expect(result).toEqual({ success: true, action: 'approve', setupDeliveryStatus: 'failed' });
		expect(updateAccessRequest.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'approved',
				reviewed_by: 'admin-1'
			})
		);
		expect((ctx.audit as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event.action)).toEqual([
			'access_request.approved',
			'access_request.account_setup_link_delivery_failed'
		]);
	});

	it('returns a conflict when another setup-link creation wins during approval', async () => {
		const accessRequest = {
			id: 'request-1',
			email: 'Soldier@Example.mil',
			status: 'pending'
		};
		const selectAccessRequest = makeSelectAccessRequest(accessRequest);
		const updateAccessRequest = makeUpdateAccessRequest();
		const adminClient = makeAdminClient({
			select: selectAccessRequest.select,
			update: updateAccessRequest.update
		});
		createServiceMock.mockReturnValue({
			createForAccessRequest: vi.fn().mockResolvedValue({ status: 'concurrent-create' })
		});

		const result = await actions.approve({
			__ctx: makeContext(adminClient),
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('http://localhost/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['approve']>[0]);

		expect(result).toMatchObject({
			status: 409,
			data: {
				error:
					'Another setup link is being created for this request. Refresh and try again if a fresh link does not appear.'
			}
		});
		expect(sendOutboxDeliveryMock).not.toHaveBeenCalled();
	});

	it('uses the public app origin for setup links created from the production admin host', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		const accessRequest = {
			id: 'request-1',
			email: 'Soldier@Example.mil',
			status: 'pending'
		};
		const selectAccessRequest = makeSelectAccessRequest(accessRequest);
		const updateAccessRequest = makeUpdateAccessRequest();
		const adminClient = makeAdminClient({
			select: selectAccessRequest.select,
			update: updateAccessRequest.update
		});
		createServiceMock.mockReturnValue({
			createForAccessRequest: vi.fn().mockResolvedValue({
				status: 'created',
				accessRequestId: 'request-1',
				setupPath: '/auth/setup-account?token=raw-token',
				expiresAt: new Date('2026-06-01T12:00:00.000Z'),
				link: { id: 'link-1' }
			})
		});

		await actions.approve({
			__ctx: makeContext(adminClient),
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('https://admin.trooptotask.org/access-requests')
		} as unknown as Parameters<(typeof actions)['approve']>[0]);

		expect(sendOutboxDeliveryMock).toHaveBeenCalledWith(
			{ store: 'auth-email-outbox-store' },
			sendSetupEmailMock,
			expect.objectContaining({
				setupUrl: 'https://trooptotask.org/auth/setup-account?token=raw-token'
			})
		);
	});

	it('resending setup for an approved incomplete request replaces older links and sends a fresh setup URL', async () => {
		const accessRequest = {
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setup_completed_at: null
		};
		const selectAccessRequest = makeSelectAccessRequest(accessRequest);
		const inviteUserByEmail = vi.fn();
		const adminClient = makeAdminClient({
			select: selectAccessRequest.select,
			inviteUserByEmail
		});
		const createForAccessRequest = vi.fn().mockResolvedValue({
			status: 'created',
			accessRequestId: 'request-1',
			setupPath: '/auth/setup-account?token=fresh-token',
			expiresAt: new Date('2026-06-02T12:00:00.000Z'),
			link: { id: 'link-2' }
		});
		createServiceMock.mockReturnValue({ createForAccessRequest });
		const ctx = makeContext(adminClient);

		const result = await actions.resend({
			__ctx: ctx,
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('http://localhost/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['resend']>[0]);

		expect(result).toEqual({ success: true, action: 'resend', setupDeliveryStatus: 'sent' });
		expect(createForAccessRequest).toHaveBeenCalledWith('request-1');
		expect(sendOutboxDeliveryMock).toHaveBeenCalledWith({ store: 'auth-email-outbox-store' }, sendSetupEmailMock, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-2',
			email: 'soldier@example.mil',
			setupUrl: 'http://localhost/auth/setup-account?token=fresh-token',
			expiresAt: new Date('2026-06-02T12:00:00.000Z')
		});
		expect(inviteUserByEmail).not.toHaveBeenCalled();
		expect((ctx.audit as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event.action)).toEqual([
			'access_request.account_setup_link_resent'
		]);
	});

	it('records failed resend delivery without requiring another approval', async () => {
		const accessRequest = {
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setup_completed_at: null
		};
		const selectAccessRequest = makeSelectAccessRequest(accessRequest);
		const adminClient = makeAdminClient({
			select: selectAccessRequest.select
		});
		const createForAccessRequest = vi.fn().mockResolvedValue({
			status: 'created',
			accessRequestId: 'request-1',
			setupPath: '/auth/setup-account?token=fresh-token',
			expiresAt: new Date('2026-06-02T12:00:00.000Z'),
			link: { id: 'link-2' }
		});
		createServiceMock.mockReturnValue({ createForAccessRequest });
		sendOutboxDeliveryMock.mockResolvedValueOnce({
			status: 'failed',
			error: 'mail provider unavailable',
			outbox: { id: 'outbox-2', status: 'failed' }
		});
		const ctx = makeContext(adminClient);

		const result = await actions.resend({
			__ctx: ctx,
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('http://localhost/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['resend']>[0]);

		expect(result).toEqual({ success: true, action: 'resend', setupDeliveryStatus: 'failed' });
		expect(createForAccessRequest).toHaveBeenCalledWith('request-1');
		expect(sendOutboxDeliveryMock).toHaveBeenCalledWith({ store: 'auth-email-outbox-store' }, sendSetupEmailMock, {
			accessRequestId: 'request-1',
			setupLinkId: 'link-2',
			email: 'soldier@example.mil',
			setupUrl: 'http://localhost/auth/setup-account?token=fresh-token',
			expiresAt: new Date('2026-06-02T12:00:00.000Z')
		});
		expect((ctx.audit as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event.action)).toEqual([
			'access_request.account_setup_link_delivery_failed'
		]);
	});

	it('blocks setup resend for completed access requests', async () => {
		const accessRequest = {
			id: 'request-1',
			email: 'soldier@example.mil',
			status: 'approved',
			setup_completed_at: '2026-05-20T12:00:00.000Z'
		};
		const selectAccessRequest = makeSelectAccessRequest(accessRequest);
		const adminClient = makeAdminClient({ select: selectAccessRequest.select });
		const createForAccessRequest = vi.fn();
		createServiceMock.mockReturnValue({ createForAccessRequest });

		const result = await actions.resend({
			__ctx: makeContext(adminClient),
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('http://localhost/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['resend']>[0]);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
			}
		});
		expect(createForAccessRequest).not.toHaveBeenCalled();
		expect(sendSetupEmailMock).not.toHaveBeenCalled();
	});

	it('rejects pending requests and blocks linked invitations through the admin client transition', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: [
				{
					reject_status: 'rejected',
					organization_invitation_id: 'invite-1',
					organization_id: 'org-1',
					invitation_email: 'invitee@example.com',
					blocked_at: '2026-05-22T12:00:00.000Z'
				}
			],
			error: null
		});
		const adminClient = makeAdminClient({ rpc });
		const sessionClient = makeAdminClient({ update: vi.fn(() => ({ eq: vi.fn() })) });
		const ctx = makeContext(adminClient);

		const result = await actions.reject({
			__ctx: ctx,
			locals: { supabase: sessionClient },
			request: makeRequest({ requestId: 'request-1' })
		} as unknown as Parameters<(typeof actions)['reject']>[0]);

		expect(result).toEqual({ success: true, action: 'reject' });
		expect(rpc).toHaveBeenCalledWith('reject_access_request_and_block_linked_invitations', {
			p_access_request_id: 'request-1',
			p_reviewer_id: 'admin-1'
		});
		expect(adminClient.from).not.toHaveBeenCalled();
		expect(sessionClient.from).not.toHaveBeenCalled();
		expect(ctx.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'access_request.rejected',
				details: { blockedInvitationCount: 1 }
			})
		);
		expect(notifyAdminsMock).toHaveBeenCalledWith('org-1', 'admin-1', {
			type: 'member_invite_blocked',
			title: 'Invitation Blocked',
			message:
				'"invitee@example.com" can no longer use the organization invitation because platform access was rejected.',
			link: '/org/org-1/settings'
		});
	});

	it('returns not found when rejecting an already reviewed request', async () => {
		const adminClient = makeAdminClient({
			rpc: vi.fn().mockResolvedValue({
				data: [{ reject_status: 'not_found' }],
				error: null
			})
		});

		const result = await actions.reject({
			__ctx: makeContext(adminClient),
			locals: { supabase: makeAdminClient() },
			request: makeRequest({ requestId: 'request-1' })
		} as unknown as Parameters<(typeof actions)['reject']>[0]);

		expect(result).toEqual({ status: 404, data: { error: 'Request not found or already reviewed' } });
	});

	it('maps access request rejection transition failures to a server error', async () => {
		const adminClient = makeAdminClient({
			rpc: vi.fn().mockResolvedValue({
				data: null,
				error: { message: 'rpc unavailable' }
			})
		});

		const result = await actions.reject({
			__ctx: makeContext(adminClient),
			locals: { supabase: makeAdminClient() },
			request: makeRequest({ requestId: 'request-1' })
		} as unknown as Parameters<(typeof actions)['reject']>[0]);

		expect(result).toEqual({ status: 500, data: { error: 'Failed to reject request' } });
	});
});
