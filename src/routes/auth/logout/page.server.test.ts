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
			request: new Request('http://app.invalid/auth/logout'),
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
	it.each(['provider error', 'exception', 'missing result', 'missing acknowledgement'])(
		'keeps pending authentication intact after %s and allows retry',
		async (failure) => {
			const { event, signOut, cookies } = makeLogoutEvent();
			if (failure === 'exception') signOut.mockRejectedValueOnce(new Error('private provider detail'));
			else
				signOut.mockResolvedValueOnce(
					failure === 'provider error'
						? { error: { message: 'private provider detail' } }
						: failure === 'missing result'
							? null
							: {}
				);
			const result = await actions.default(event as unknown as LogoutActionEvent);
			expect(result).toMatchObject({ status: 503, data: { error: expect.any(String) } });
			expect(JSON.stringify(result)).not.toContain('private provider detail');
			expect(cookies.delete).not.toHaveBeenCalled();
			await expect(actions.default(event as unknown as LogoutActionEvent)).rejects.toMatchObject({
				status: 303,
				location: '/'
			});
			expect(cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
		}
	);

	it('allows the failed POST to render its retry page without a redirect hiding the error', async () => {
		const { event } = makeLogoutEvent();
		event.request = new Request('http://app.invalid/auth/logout', { method: 'POST' });
		await expect(load(event as unknown as LogoutLoadEvent)).resolves.toEqual({});
	});

	it('signs out, clears pending auth flow state, and redirects home', async () => {
		const { event, signOut, cookies } = makeLogoutEvent();

		await expect(actions.default(event as unknown as LogoutActionEvent)).rejects.toMatchObject({
			status: 303,
			location: '/'
		});

		expect(signOut).toHaveBeenCalledOnce();
		expect(cookies.delete).toHaveBeenCalledWith(getPendingAuthFlowCookieName(), { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('ttt_password_completion', { path: '/' });
	});
});
