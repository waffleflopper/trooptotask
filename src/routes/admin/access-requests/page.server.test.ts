import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServiceMock, createStoreMock, createOutboxStoreMock, sendSetupEmailMock, sendOutboxDeliveryMock } =
	vi.hoisted(() => ({
		createServiceMock: vi.fn(),
		createStoreMock: vi.fn(),
		createOutboxStoreMock: vi.fn(),
		sendSetupEmailMock: vi.fn(),
		sendOutboxDeliveryMock: vi.fn()
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

import { actions } from './+page.server';

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

function makeRejectAccessRequestUpdate() {
	const eqStatus = vi.fn().mockResolvedValue({ error: null });
	const eqId = vi.fn(() => ({ eq: eqStatus }));
	const update = vi.fn(() => ({ eq: eqId }));

	return { update, eqId, eqStatus };
}

function makeAdminClient(parts: { select?: unknown; update?: unknown; inviteUserByEmail?: unknown } = {}) {
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
		auth: {
			admin: {
				inviteUserByEmail: parts.inviteUserByEmail ?? vi.fn()
			}
		}
	};
}

function makeContext(adminClient: unknown) {
	return {
		adminClient,
		adminUser: { id: 'admin-1', role: 'super_admin' },
		audit: vi.fn()
	};
}

describe('admin access request account setup delivery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		createStoreMock.mockReturnValue({ store: 'account-setup-store' });
		createOutboxStoreMock.mockReturnValue({ store: 'auth-email-outbox-store' });
		sendSetupEmailMock.mockResolvedValue(undefined);
		sendOutboxDeliveryMock.mockResolvedValue({
			status: 'sent',
			outbox: { id: 'outbox-1', status: 'sent' }
		});
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

	it('rejects pending requests through the admin client instead of the session client', async () => {
		const rejectUpdate = makeRejectAccessRequestUpdate();
		const adminClient = makeAdminClient({ update: rejectUpdate.update });
		const sessionClient = makeAdminClient({ update: vi.fn(() => ({ eq: vi.fn() })) });
		const ctx = makeContext(adminClient);

		const result = await actions.reject({
			__ctx: ctx,
			locals: { supabase: sessionClient },
			request: makeRequest({ requestId: 'request-1' })
		} as unknown as Parameters<(typeof actions)['reject']>[0]);

		expect(result).toEqual({ success: true, action: 'reject' });
		expect(adminClient.from).toHaveBeenCalledWith('access_requests');
		expect(sessionClient.from).not.toHaveBeenCalled();
		expect(rejectUpdate.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'rejected',
				reviewed_by: 'admin-1'
			})
		);
		expect(rejectUpdate.eqId).toHaveBeenCalledWith('id', 'request-1');
		expect(rejectUpdate.eqStatus).toHaveBeenCalledWith('status', 'pending');
	});
});
