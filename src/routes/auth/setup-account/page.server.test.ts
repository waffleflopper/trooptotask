import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: vi.fn().mockReturnValue({ admin: true }),
	getSupabaseClient: vi.fn().mockReturnValue({ session: true })
}));

const complete = vi.fn();
vi.mock('$lib/server/accountSetupCompletion', () => ({
	createAccountSetupCompletionService: vi.fn(() => ({ complete }))
}));

vi.mock('$lib/server/accountSetupCompletionSupabase', () => ({
	createSupabaseAccountSetupCompletionStore: vi.fn(() => ({
		getAccessRequest: vi.fn(),
		findByTokenHash: vi.fn()
	})),
	createSupabaseAccountSetupAuthAdapter: vi.fn(() => ({}))
}));

import { actions } from './+page.server';

function makeRequest(input: { token?: string; password?: string; confirmPassword?: string }) {
	const formData = new FormData();
	formData.set('token', input.token ?? 'setup-token');
	formData.set('password', input.password ?? 'ValidPassword123!');
	formData.set('confirmPassword', input.confirmPassword ?? input.password ?? 'ValidPassword123!');
	return { formData: vi.fn().mockResolvedValue(formData) };
}

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
