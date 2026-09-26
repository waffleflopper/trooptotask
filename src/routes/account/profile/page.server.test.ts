import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsertUserProfileMock } = vi.hoisted(() => ({
	upsertUserProfileMock: vi.fn()
}));

vi.mock('$features/identity/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/identity/index.server')>(
		'$features/identity/index.server'
	);

	return {
		...actual,
		upsertUserProfile: upsertUserProfileMock
	};
});

import { actions, load } from './+page.server';
import { load as loadAccountLayout } from '../+layout.server';

function makeProfileRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/account/profile', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

describe('account profile page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		upsertUserProfileMock.mockResolvedValue(undefined);
	});

	it.each([
		['profile load', load],
		['profile save', actions.default],
		['account layout', loadAccountLayout]
	] as const)('denies %s when provider identity has no admitted actor', async (_, handler) => {
		const from = vi.fn();
		const request = makeProfileRequest({ firstName: 'Jane', lastName: 'Smith', rank: 'SGT' });
		await expect(
			handler({
				locals: { actor: null, user: { id: 'user-1' }, supabase: { from } },
				request,
				url: new URL(request.url)
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(from).not.toHaveBeenCalled();
		expect(upsertUserProfileMock).not.toHaveBeenCalled();
	});

	it('returns a generic 500 when profile persistence exposes provider details', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		upsertUserProfileMock.mockRejectedValueOnce(new Error('relation "user_profiles" does not exist provider_secret'));

		const result = await actions.default({
			request: makeProfileRequest({
				firstName: 'Emma',
				lastName: 'Hayes',
				rank: 'CPT'
			}),
			locals: { actor: { userId: 'user-1' }, user: { id: 'user-1' } }
		} as never);

		expect(result).toMatchObject({
			status: 500,
			data: { error: 'An internal server error occurred' }
		});
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('user_profiles');
		expect(serialized).not.toContain('provider_secret');
		expect(consoleError).toHaveBeenCalledWith('[profile] Failed to save profile');
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain('provider_secret');
		consoleError.mockRestore();
	});

	it('keeps validation failures user-correctable', async () => {
		const result = await actions.default({
			request: makeProfileRequest({
				firstName: '',
				lastName: 'Hayes',
				rank: 'CPT'
			}),
			locals: { actor: { userId: 'user-1' }, user: { id: 'user-1' } }
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'First name is required' }
		});
		expect(upsertUserProfileMock).not.toHaveBeenCalled();
	});

	it('rejects a file submitted as a profile field before persistence', async () => {
		const body = new FormData();
		body.set('firstName', new File(['unexpected'], 'name.txt', { type: 'text/plain' }));
		body.set('lastName', 'Hayes');
		body.set('rank', 'CPT');
		const result = await actions.default({
			request: new Request('http://localhost/account/profile', { method: 'POST', body }),
			locals: { actor: { userId: 'user-1' }, user: { id: 'user-1' } }
		} as never);
		expect(result).toMatchObject({ status: 400, data: { error: 'First name is required' } });
		expect(upsertUserProfileMock).not.toHaveBeenCalled();
	});
});
