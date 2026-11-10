import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildRouteRequestMock,
	createRequestNotificationContextMock,
	createSettingsSensitiveNotificationContextMock,
	inviteOrganizationMembersMock,
	resendOrganizationInvitationMock,
	setOrganizationMemberNameMock
} = vi.hoisted(() => ({
	buildRouteRequestMock: vi.fn(),
	createRequestNotificationContextMock: vi.fn(),
	createSettingsSensitiveNotificationContextMock: vi.fn(),
	inviteOrganizationMembersMock: vi.fn(),
	resendOrganizationInvitationMock: vi.fn(),
	setOrganizationMemberNameMock: vi.fn()
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
		inviteOrganizationMembers: inviteOrganizationMembersMock,
		resendOrganizationInvitation: resendOrganizationInvitationMock,
		setOrganizationMemberName: setOrganizationMemberNameMock
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

const inviteForm = () =>
	new URLSearchParams({ emails: 'first@example.com\nsecond@example.com', membershipRole: 'admin' });
const nameForm = () =>
	new URLSearchParams({ membershipId: 'membership-1', rank: 'SGT', firstName: 'Jo', lastName: 'Reyes' });
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
		['invite', inviteOrganizationMembersMock, inviteForm],
		['resendInvite', resendOrganizationInvitationMock, resendForm]
	] as const)('%s hides a raw Auth lookup error behind a generic 500', async (name, useCase, form) => {
		useCase.mockRejectedValue(authApiError(403, 'invalid JWT: unable to parse or verify signature'));

		const result = await actions[name](actionEvent(name, form()));

		expect(result).toEqual({ status: 500, data: { inviteError: 'Internal server error' } });
	});

	it('forwards an app-created failure for the whole submission', async () => {
		inviteOrganizationMembersMock.mockRejectedValue(new RequestFailure(400, 'Invite up to 50 addresses at a time'));

		const result = await actions.invite(actionEvent('invite', inviteForm()));

		expect(result).toEqual({ status: 400, data: { inviteError: 'Invite up to 50 addresses at a time' } });
	});

	it('passes every pasted address to one invite submission', async () => {
		inviteOrganizationMembersMock.mockResolvedValue({ inviteSuccess: true, inviteResults: [], inviteMessage: '' });

		await actions.invite(actionEvent('invite', inviteForm()));

		expect(inviteOrganizationMembersMock).toHaveBeenCalledTimes(1);
		expect(inviteOrganizationMembersMock.mock.calls[0][1]).toMatchObject({
			emails: 'first@example.com\nsecond@example.com',
			membershipRole: 'admin'
		});
	});

	it('answers a name save from a signed-out request with a redirect to sign in', async () => {
		const event = actionEvent('setMemberName', nameForm()) as { locals: { user: unknown } };
		event.locals.user = null;

		await expect(actions.setMemberName(event as never)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(setOrganizationMemberNameMock).not.toHaveBeenCalled();
	});

	it('hands the submitted name and the built-in ranks to the command', async () => {
		setOrganizationMemberNameMock.mockResolvedValue({ nameSuccess: true, nameMembershipId: 'membership-1' });

		const result = await actions.setMemberName(actionEvent('setMemberName', nameForm()));

		expect(result).toEqual({ nameSuccess: true, nameMembershipId: 'membership-1' });
		const [, input] = setOrganizationMemberNameMock.mock.calls[0];
		expect(input).toMatchObject({
			membershipId: 'membership-1',
			rank: 'SGT',
			firstName: 'Jo',
			lastName: 'Reyes'
		});
		expect(input.allowedRanks).toContain('SGT');
	});

	it('reports a refused name save under the name error key', async () => {
		setOrganizationMemberNameMock.mockRejectedValue(new RequestFailure(403, 'You cannot name this member'));

		const result = await actions.setMemberName(actionEvent('setMemberName', nameForm()));

		expect(result).toEqual({ status: 403, data: { nameError: 'You cannot name this member' } });
	});

	it('keeps step-up fields on a sensitive-action denial', async () => {
		inviteOrganizationMembersMock.mockRejectedValue(
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
