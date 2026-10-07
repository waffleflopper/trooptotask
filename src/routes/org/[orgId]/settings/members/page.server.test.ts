import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildRouteRequestMock,
	createRequestNotificationContextMock,
	createSettingsSensitiveNotificationContextMock,
	inviteOrganizationMemberMock,
	resendOrganizationInvitationMock
} = vi.hoisted(() => ({
	buildRouteRequestMock: vi.fn(),
	createRequestNotificationContextMock: vi.fn(),
	createSettingsSensitiveNotificationContextMock: vi.fn(),
	inviteOrganizationMemberMock: vi.fn(),
	resendOrganizationInvitationMock: vi.fn()
}));

vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({}) }));

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);
	return {
		...actual,
		buildRouteRequest: buildRouteRequestMock,
		createRequestNotificationContext: createRequestNotificationContextMock
	};
});

vi.mock('../settingsRequestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('../settingsRequestContexts.server')>(
		'../settingsRequestContexts.server'
	);
	return {
		...actual,
		createSettingsSensitiveNotificationContext: createSettingsSensitiveNotificationContextMock
	};
});

vi.mock('$features/organization/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/organization/index.server')>(
		'$features/organization/index.server'
	);
	return {
		...actual,
		inviteOrganizationMember: inviteOrganizationMemberMock,
		resendOrganizationInvitation: resendOrganizationInvitationMock
	};
});

import { RequestFailure } from '$lib/errors';
import { actions } from './+page.server';

const requestContext = {
	auth: { orgId: 'org-1' },
	audit: { log: vi.fn() },
	notifications: {},
	sensitiveActionAuthorizer: {}
};

function authApiError(status: number, message: string) {
	return Object.assign(new Error(message), { name: 'AuthApiError', status, code: 'user_not_found' });
}

function actionEvent(actionName: string, body: URLSearchParams) {
	return {
		request: new Request(`http://localhost/org/org-1/settings/members?/${actionName}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		}),
		url: new URL(`http://localhost/org/org-1/settings/members?/${actionName}`),
		locals: { user: { id: 'user-1', email: 'admin@example.com' }, supabase: {} },
		params: { orgId: 'org-1' },
		cookies: {},
		getClientAddress: () => '127.0.0.1'
	} as never;
}

const inviteForm = () => new URLSearchParams({ email: 'recipient@example.com', membershipRole: 'admin' });
const resendForm = () => new URLSearchParams({ inviteId: 'invite-1' });

describe('members settings actions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		buildRouteRequestMock.mockResolvedValue(requestContext);
		createRequestNotificationContextMock.mockReturnValue(requestContext);
		createSettingsSensitiveNotificationContextMock.mockReturnValue(requestContext);
	});

	it.each([
		['invite', inviteOrganizationMemberMock, inviteForm],
		['resendInvite', resendOrganizationInvitationMock, resendForm]
	] as const)('%s hides a raw Auth lookup error behind a generic 500', async (name, useCase, form) => {
		useCase.mockRejectedValue(authApiError(403, 'invalid JWT: unable to parse or verify signature'));

		const result = await actions[name](actionEvent(name, form()));

		expect(result).toEqual({ status: 500, data: { inviteError: 'Internal server error' } });
		expect(console.error).toHaveBeenCalledWith(
			'[http-adapter] Unhandled route error:',
			expect.stringContaining('name=AuthApiError')
		);
	});

	it('forwards an app-created duplicate-invite failure', async () => {
		inviteOrganizationMemberMock.mockRejectedValue(
			new RequestFailure(409, 'An invitation is already pending for this email')
		);

		const result = await actions.invite(actionEvent('invite', inviteForm()));

		expect(result).toEqual({
			status: 409,
			data: { inviteError: 'An invitation is already pending for this email' }
		});
	});

	it('keeps step-up fields on a sensitive-action denial', async () => {
		inviteOrganizationMemberMock.mockRejectedValue(
			new RequestFailure(403, 'Please confirm your identity before continuing.', {
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/login'
			})
		);

		const result = await actions.invite(actionEvent('invite', inviteForm()));

		expect(result).toEqual({
			status: 403,
			data: {
				inviteError: 'Please confirm your identity before continuing.',
				reason: 'denied.staleSession',
				requiresStepUp: true,
				stepUpPath: '/auth/login'
			}
		});
	});
});
