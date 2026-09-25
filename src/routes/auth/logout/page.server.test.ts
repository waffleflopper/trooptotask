import { describe, expect, it, vi } from 'vitest';
import { getPendingAuthFlowCookieName } from '$features/identity/index.server';
import { actions, load } from './+page.server';

type LogoutLoadEvent = Parameters<typeof load>[0];
type LogoutActionEvent = Parameters<(typeof actions)['default']>[0];

function makeLogoutEvent() {
	const signOut = vi.fn().mockResolvedValue({ error: null });
	const getSession = vi
		.fn()
		.mockResolvedValue({ data: { session: { access_token: 'synthetic-access' } }, error: null });
	const cookies = {
		delete: vi.fn(),
		getAll: () => [
			{ name: 'sb-example-auth-token.0', value: 'session' },
			{ name: 'theme', value: 'dark' }
		]
	};

	return {
		event: {
			request: new Request('http://app.invalid/auth/logout'),
			locals: {
				supabase: {
					auth: {
						getSession,
						admin: { signOut }
					}
				}
			},
			cookies
		},
		signOut,
		getSession,
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

		expect(signOut).toHaveBeenCalledExactlyOnceWith('synthetic-access', 'global');
		expect(cookies.delete).toHaveBeenCalledWith(getPendingAuthFlowCookieName(), { path: '/' });
	});
});

it.each([
	null,
	{},
	{ data: {}, error: null },
	{ data: { session: { access_token: '' } }, error: null },
	{ data: { session: null }, error: { message: 'private detail' } }
])('does not revoke or clear cookies on unconfirmed session result %j', async (result) => {
	const { event, getSession, signOut, cookies } = makeLogoutEvent();
	getSession.mockResolvedValue(result);
	expect(await actions.default(event as unknown as LogoutActionEvent)).toMatchObject({ status: 503 });
	expect(signOut).not.toHaveBeenCalled();
	expect(cookies.delete).not.toHaveBeenCalled();
});
it('reports only local absence when there is no session to revoke', async () => {
	const { event, getSession, signOut, cookies } = makeLogoutEvent();
	getSession.mockResolvedValue({ data: { session: null }, error: null });
	expect(await actions.default(event as unknown as LogoutActionEvent)).toEqual({ localOnly: true });
	expect(signOut).not.toHaveBeenCalled();
	expect(cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
	expect(cookies.delete).not.toHaveBeenCalledWith('theme', expect.anything());
});
