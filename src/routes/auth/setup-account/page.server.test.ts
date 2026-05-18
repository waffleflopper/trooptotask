import { beforeEach, describe, expect, it, vi } from 'vitest';

const { complete, validateToken, getAccessRequest, setupStore } = vi.hoisted(() => {
	const setupStore = {
		getAccessRequest: vi.fn(),
		findByTokenHash: vi.fn()
	};
	return {
		complete: vi.fn(),
		validateToken: vi.fn(),
		getAccessRequest: setupStore.getAccessRequest,
		setupStore
	};
});

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: vi.fn().mockReturnValue({ admin: true }),
	getSupabaseClient: vi.fn().mockReturnValue({ session: true })
}));

vi.mock('$lib/server/accountSetupLinks', () => ({
	createAccountSetupLinkService: vi.fn(() => ({ validateToken }))
}));

vi.mock('$lib/server/accountSetupCompletion', () => ({
	createAccountSetupCompletionService: vi.fn(() => ({ complete }))
}));

vi.mock('$lib/server/accountSetupCompletionSupabase', () => ({
	createSupabaseAccountSetupCompletionStore: vi.fn(() => setupStore),
	createSupabaseAccountSetupAuthAdapter: vi.fn(() => ({}))
}));

import { actions, load } from './+page.server';

function makeRequest(input: { token?: string; password?: string; confirmPassword?: string }) {
	const formData = new FormData();
	formData.set('token', input.token ?? 'setup-token');
	formData.set('password', input.password ?? 'ValidPassword123!');
	formData.set('confirmPassword', input.confirmPassword ?? input.password ?? 'ValidPassword123!');
	return { formData: vi.fn().mockResolvedValue(formData) };
}

function makeLoadEvent(input: { token?: string; session?: unknown } = {}) {
	const url = new URL('http://localhost/auth/setup-account');
	if (input.token) {
		url.searchParams.set('token', input.token);
	}
	return {
		locals: {
			session: input.session ?? null,
			authFlow: null,
			mfaPending: false
		},
		url
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('/auth/setup-account load', () => {
	it('returns missing state without validating when no token is present', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toEqual({
			state: 'missing',
			message: 'This Account Setup Link is invalid. Request a fresh setup link and try again.',
			token: ''
		});
		expect(validateToken).not.toHaveBeenCalled();
	});

	it('maps invalid token states to recovery copy', async () => {
		validateToken.mockResolvedValueOnce({ status: 'expired' });

		const result = await load(makeLoadEvent({ token: 'expired-token' }));

		expect(result).toEqual({
			state: 'expired',
			message: 'This Account Setup Link has expired. Request a fresh setup link and use the newest email.',
			token: 'expired-token'
		});
		expect(validateToken).toHaveBeenCalledWith('expired-token');
	});

	it('returns valid state and email for an incomplete Access Request', async () => {
		validateToken.mockResolvedValueOnce({ status: 'valid', accessRequestId: 'request-1' });
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			setupCompletedAt: null
		});

		const result = await load(makeLoadEvent({ token: 'valid-token' }));

		expect(result).toEqual({
			state: 'valid',
			email: 'soldier@example.mil',
			token: 'valid-token'
		});
	});

	it('maps completed Access Requests to used-link copy', async () => {
		validateToken.mockResolvedValueOnce({ status: 'valid', accessRequestId: 'request-1' });
		getAccessRequest.mockResolvedValueOnce({
			id: 'request-1',
			email: 'soldier@example.mil',
			setupCompletedAt: '2026-05-18T12:00:00.000Z'
		});

		const result = await load(makeLoadEvent({ token: 'used-token' }));

		expect(result).toEqual({
			state: 'used',
			message: 'This setup link has already been used. Sign in or reset your password if you need access.',
			token: 'used-token'
		});
	});

	it('redirects authenticated users before token validation', async () => {
		await expect(
			load(makeLoadEvent({ token: 'valid-token', session: { user: { id: 'user-1' } } }))
		).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
		expect(validateToken).not.toHaveBeenCalled();
	});
});

describe('/auth/setup-account actions', () => {
	it('validates password confirmation before creating a User Account', async () => {
		const result = await actions.default({
			request: makeRequest({ password: 'ValidPassword123!', confirmPassword: 'DifferentPassword123!' }),
			locals: { supabase: {} }
		} as unknown as Parameters<(typeof actions)['default']>[0]);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Passwords do not match' }
		});
		expect(complete).not.toHaveBeenCalled();
	});

	it('maps invalid setup-token states to user-facing recovery copy', async () => {
		complete.mockResolvedValueOnce({ status: 'revoked' });

		const result = await actions.default({
			request: makeRequest({}),
			locals: { supabase: {} }
		} as unknown as Parameters<(typeof actions)['default']>[0]);

		expect(result).toMatchObject({
			status: 400,
			data: {
				error: 'This Account Setup Link was replaced. Check your inbox for the newest setup email.'
			}
		});
	});

	it('returns provider-edge failures without accepting an Organization Invitation', async () => {
		complete.mockResolvedValueOnce({ status: 'account-create-failed', message: 'Supabase unavailable' });

		const result = await actions.default({
			request: makeRequest({}),
			locals: { supabase: {} }
		} as unknown as Parameters<(typeof actions)['default']>[0]);

		expect(result).toMatchObject({
			status: 500,
			data: { error: 'Supabase unavailable' }
		});
		expect(complete).toHaveBeenCalledWith({
			rawToken: 'setup-token',
			password: 'ValidPassword123!'
		});
	});
});
