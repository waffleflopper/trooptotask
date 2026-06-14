import { describe, expect, it, vi } from 'vitest';
import { getPendingAuthFlowCookieName } from '$lib/server/mfaGate';
import { actions, load } from './+page.server';

type LogoutLoadEvent = Parameters<typeof load>[0];
type LogoutActionEvent = Parameters<(typeof actions)['default']>[0];

function makeLogoutEvent() {
	const signOut = vi.fn().mockResolvedValue({ error: null });
	const cookies = { delete: vi.fn() };

	return {
		event: {
			locals: {
				supabase: {
					auth: {
						signOut
					}
				}
			},
			cookies
		},
		signOut,
		cookies
	};
}

describe('GET /auth/logout', () => {
	it('redirects without signing out or clearing pending auth flow state', async () => {
		const { event, signOut, cookies } = makeLogoutEvent();

		await expect(load(event as unknown as LogoutLoadEvent)).rejects.toMatchObject({
			status: 303,
			location: '/'
		});

		expect(signOut).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});
});

describe('POST /auth/logout', () => {
	it('signs out, clears pending auth flow state, and redirects home', async () => {
		const { event, signOut, cookies } = makeLogoutEvent();

		await expect(actions.default(event as unknown as LogoutActionEvent)).rejects.toMatchObject({
			status: 303,
			location: '/'
		});

		expect(signOut).toHaveBeenCalledOnce();
		expect(cookies.delete).toHaveBeenCalledWith(getPendingAuthFlowCookieName(), { path: '/' });
	});
});
