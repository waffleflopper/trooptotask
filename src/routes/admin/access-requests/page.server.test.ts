import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const { administrationMock, createAdministrationMock } = vi.hoisted(() => {
	const administration = {
		list: vi.fn(),
		approve: vi.fn(),
		resendSetup: vi.fn(),
		reject: vi.fn()
	};

	return {
		administrationMock: administration,
		createAdministrationMock: vi.fn(() => administration)
	};
});

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	adminAction: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event),
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformAccessRequestAdministration', () => ({
	createSupabasePlatformAccessRequestAdministration: createAdministrationMock
}));

import { actions, load } from './+page.server';

function makeRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/admin/access-requests', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

function makeContext() {
	return {
		adminUser: { id: 'admin-1', role: 'super_admin' },
		adminClient: {},
		sessionClient: {},
		session: null,
		audit: vi.fn()
	};
}

describe('admin access request route shell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		administrationMock.list.mockResolvedValue({ pending: [], reviewed: [] });
		administrationMock.approve.mockResolvedValue({ status: 'sent', setupDeliveryStatus: 'sent' });
		administrationMock.resendSetup.mockResolvedValue({ status: 'sent', setupDeliveryStatus: 'sent' });
		administrationMock.reject.mockResolvedValue({ status: 'rejected' });
	});

	it('load returns the Platform Access Request Administration list model', async () => {
		administrationMock.list.mockResolvedValueOnce({
			pending: [{ id: 'pending-1' }],
			reviewed: [{ id: 'reviewed-1' }]
		});

		const result = (await load({
			__ctx: makeContext()
		} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(result).toEqual({
			pending: [{ id: 'pending-1' }],
			reviewed: [{ id: 'reviewed-1' }]
		});
		expect(createAdministrationMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminUser: { id: 'admin-1', role: 'super_admin' } })
		);
	});

	it('parses approve form data and maps a sent result to the current success shape', async () => {
		const result = await actions.approve({
			__ctx: makeContext(),
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('https://admin.trooptotask.org/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['approve']>[0]);

		expect(administrationMock.approve).toHaveBeenCalledWith({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'https://admin.trooptotask.org'
		});
		expect(result).toEqual({ success: true, action: 'approve', setupDeliveryStatus: 'sent' });
	});

	it('parses resend form data and maps delivery failure to a completed action with failed delivery status', async () => {
		administrationMock.resendSetup.mockResolvedValueOnce({
			status: 'delivery_failed',
			setupDeliveryStatus: 'failed'
		});

		const result = await actions.resend({
			__ctx: makeContext(),
			request: makeRequest({ requestId: 'request-1' }),
			url: new URL('http://localhost/admin/access-requests')
		} as unknown as Parameters<(typeof actions)['resend']>[0]);

		expect(administrationMock.resendSetup).toHaveBeenCalledWith({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1',
			publicOrigin: 'http://localhost'
		});
		expect(result).toEqual({ success: true, action: 'resend', setupDeliveryStatus: 'failed' });
	});

	it('parses reject form data and maps rejection success', async () => {
		const result = await actions.reject({
			__ctx: makeContext(),
			request: makeRequest({ requestId: 'request-1' })
		} as unknown as Parameters<(typeof actions)['reject']>[0]);

		expect(administrationMock.reject).toHaveBeenCalledWith({
			accessRequestId: 'request-1',
			actorUserId: 'admin-1'
		});
		expect(result).toEqual({ success: true, action: 'reject' });
	});

	it('preserves current user-facing failure shapes for command results', async () => {
		administrationMock.approve.mockResolvedValueOnce({ status: 'already_reviewed' });
		administrationMock.resendSetup.mockResolvedValueOnce({
			status: 'authorization_denied',
			message: 'Please confirm your identity before continuing.',
			failure: {
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			}
		});
		administrationMock.reject.mockResolvedValueOnce({ status: 'failed' });

		await expect(
			actions.approve({
				__ctx: makeContext(),
				request: makeRequest({ requestId: 'request-1' }),
				url: new URL('http://localhost/admin/access-requests')
			} as unknown as Parameters<(typeof actions)['approve']>[0])
		).resolves.toEqual({ status: 404, data: { error: 'Request not found or already reviewed' } });

		await expect(
			actions.resend({
				__ctx: makeContext(),
				request: makeRequest({ requestId: 'request-1' }),
				url: new URL('http://localhost/admin/access-requests')
			} as unknown as Parameters<(typeof actions)['resend']>[0])
		).resolves.toEqual({
			status: 403,
			data: {
				error: 'Please confirm your identity before continuing.',
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			}
		});

		await expect(
			actions.reject({
				__ctx: makeContext(),
				request: makeRequest({ requestId: 'request-1' })
			} as unknown as Parameters<(typeof actions)['reject']>[0])
		).resolves.toEqual({ status: 500, data: { error: 'Failed to reject request' } });

		administrationMock.reject.mockResolvedValueOnce({
			status: 'authorization_denied',
			message: 'Please confirm your identity before continuing.',
			failure: {
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			}
		});

		await expect(
			actions.reject({
				__ctx: makeContext(),
				request: makeRequest({ requestId: 'request-1' })
			} as unknown as Parameters<(typeof actions)['reject']>[0])
		).resolves.toEqual({
			status: 403,
			data: {
				error: 'Please confirm your identity before continuing.',
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/mfa-verify'
			}
		});
	});
});
