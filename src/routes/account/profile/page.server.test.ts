import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsertCurrentUserProfileMock } = vi.hoisted(() => ({
	upsertCurrentUserProfileMock: vi.fn()
}));

vi.mock('$lib/server/userProfile', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/userProfile')>('$lib/server/userProfile');

	return {
		...actual,
		upsertCurrentUserProfile: upsertCurrentUserProfileMock
	};
});

import { actions } from './+page.server';

function makeProfileRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/account/profile', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

describe('account profile page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		upsertCurrentUserProfileMock.mockResolvedValue(undefined);
	});

	it('returns a generic 500 when profile persistence exposes provider details', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		upsertCurrentUserProfileMock.mockRejectedValueOnce(
			new Error('relation "user_profiles" does not exist provider_secret')
		);

		const result = await actions.default({
			request: makeProfileRequest({
				firstName: 'Emma',
				lastName: 'Hayes',
				rank: 'CPT'
			}),
			locals: { user: { id: 'user-1' } }
		} as never);

		expect(result).toMatchObject({
			status: 500,
			data: { error: 'An internal server error occurred' }
		});
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('user_profiles');
		expect(serialized).not.toContain('provider_secret');
		expect(consoleError).toHaveBeenCalledWith(
			'[profile] Failed to save profile:',
			expect.stringContaining('provider_secret')
		);
		consoleError.mockRestore();
	});

	it('keeps validation failures user-correctable', async () => {
		const result = await actions.default({
			request: makeProfileRequest({
				firstName: '',
				lastName: 'Hayes',
				rank: 'CPT'
			}),
			locals: { user: { id: 'user-1' } }
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'First name is required' }
		});
		expect(upsertCurrentUserProfileMock).not.toHaveBeenCalled();
	});
});
