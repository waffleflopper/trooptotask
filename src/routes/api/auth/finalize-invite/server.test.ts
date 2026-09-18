import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
import {
	PASSWORD_COMPLETION_COOKIE,
	preparePasswordCompletion,
	writePasswordCompletion
} from '$lib/server/passwordCompletion';
vi.mock('$env/dynamic/private', () => ({ env: { ACCOUNT_SETUP_SESSION_SECRET: 'synthetic-receipt-secret' } }));
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auto-accept-org-invites', () => ({
	autoAcceptOrgInvites: vi.fn().mockResolvedValue({ accepted: 2 })
}));

vi.mock('$lib/server/userProfile', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/userProfile')>();
	return {
		...actual,
		upsertCurrentUserProfile: vi.fn().mockResolvedValue(undefined)
	};
});

import { upsertCurrentUserProfile } from '$lib/server/userProfile';
import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';
import { POST } from './+server';

describe('POST /api/auth/finalize-invite', () => {
	afterEach(() => {
		vi.mocked(upsertCurrentUserProfile).mockClear();
		vi.mocked(autoAcceptOrgInvites).mockClear();
	});

	it('finalizes the invite and clears the pending invite flow marker', async () => {
		const cookies = { get: vi.fn(), delete: vi.fn() };

		const response = await POST({
			locals: {
				user: {
					id: 'user-123',
					email: 'person@example.com',
					user_metadata: {
						firstName: 'Jane',
						lastName: 'Smith',
						rank: 'SGT'
					}
				},
				session: { user: { id: 'user-123' }, access_token: 'admitted-token', expires_at: 4102444800 },
				authFlow: 'invite',
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: async () => ({
								data: { currentLevel: 'aal1', nextLevel: 'aal1' },
								error: null
							})
						}
					}
				}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, accepted: 2, activated: true });
		expect(upsertCurrentUserProfile).toHaveBeenCalledWith(expect.any(Object), {
			firstName: 'Jane',
			lastName: 'Smith',
			rank: 'SGT'
		});
		expect(autoAcceptOrgInvites).toHaveBeenCalledWith(expect.any(Object), 'person@example.com');
		expect(cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
	});

	it.each(['pending', 'expired', 'unavailable', 'complete'] as const)(
		'allows activation only after received revocation completion: %s',
		async (state) => {
			const jar = new Map<string, string>();
			const cookies = {
				get: (name: string) => jar.get(name),
				set: (name: string, value: string) => {
					jar.set(name, value);
				},
				delete: vi.fn()
			};
			const locals = {
				user: {
					id: 'actor',
					email: 'person@example.test',
					user_metadata: { firstName: 'Jane', lastName: 'Smith', rank: 'SGT' }
				},
				session: {
					user: { id: 'actor' },
					access_token: passwordSessionToken('actor'),
					expires_at: Date.now() / 1000 + 600
				},
				authFlow: 'invite',
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: async () => ({
								data: { currentLevel: 'aal2', nextLevel: 'aal2' },
								error: null
							})
						}
					}
				}
			} as unknown as App.Locals;
			const receipt = preparePasswordCompletion(locals);
			if (state === 'complete') receipt.state = 'complete';
			if (state === 'expired') receipt.expiresAt = Date.now() / 1000 - 1;
			writePasswordCompletion(cookies, receipt);
			if (state === 'unavailable') jar.set(PASSWORD_COMPLETION_COOKIE, 'altered');
			const response = await POST({ locals, cookies } as unknown as Parameters<typeof POST>[0]);
			if (state === 'complete') {
				expect(response.status).toBe(200);
				expect(autoAcceptOrgInvites).toHaveBeenCalledOnce();
			} else {
				expect(response.status).toBe(409);
				expect(await response.json()).toMatchObject({ accepted: 0, activated: false });
				expect(autoAcceptOrgInvites).not.toHaveBeenCalled();
				expect(upsertCurrentUserProfile).not.toHaveBeenCalled();
				expect(cookies.delete).not.toHaveBeenCalled();
			}
		}
	);

	it('rejects requests without an active invite session', async () => {
		const cookies = { get: vi.fn(), delete: vi.fn() };

		const response = await POST({
			locals: {
				user: null,
				supabase: {}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Your invite session is no longer active. Please reopen the invite link and try again.',
			accepted: 0,
			activated: false
		});
		expect(cookies.delete).not.toHaveBeenCalled();
	});
});
