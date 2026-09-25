import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveLoad, completeSetup } = vi.hoisted(() => ({
	resolveLoad: vi.fn(),
	completeSetup: vi.fn()
}));

vi.mock('$features/identity/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/identity/index.server')>()),
	createSupabaseAccountSetupRouteFlow: vi.fn(() => ({ resolveLoad, completeSetup }))
}));

import { actions, load } from './+page.server';

function makeCookies() {
	const values = new Map<string, string>();
	return {
		get: vi.fn((name: string) => values.get(name)),
		set: vi.fn((name: string, value: string) => values.set(name, value)),
		delete: vi.fn((name: string) => values.delete(name)),
		values
	};
}

function loadEvent(cookies: ReturnType<typeof makeCookies>, token = '') {
	return {
		cookies,
		locals: { session: null, authFlow: null, mfaPending: false },
		url: new URL(`https://trooptotask.test/auth/setup-account${token ? `?token=${token}` : ''}`)
	} as unknown as Parameters<typeof load>[0];
}

function actionEvent(cookies: ReturnType<typeof makeCookies>, fields: Record<string, string> = {}) {
	const form = new FormData();
	for (const [key, value] of Object.entries({
		password: 'ValidPassword123!',
		confirmPassword: 'ValidPassword123!',
		...fields
	})) {
		form.set(key, value);
	}
	return {
		cookies,
		locals: { session: null, authFlow: null, mfaPending: false },
		getClientAddress: () => '203.0.113.10',
		request: { formData: () => Promise.resolve(form), headers: new Headers({ 'user-agent': 'vitest-agent' }) }
	} as unknown as Parameters<(typeof actions)['default']>[0];
}

const setupSession = {
	setupLinkId: 'link-1',
	accessRequestId: 'request-1',
	expiresAt: new Date('2026-05-18T12:10:00Z').getTime()
};

async function establishSession(cookies: ReturnType<typeof makeCookies>) {
	resolveLoad.mockResolvedValueOnce({ state: 'redirect-setup', path: '/auth/setup-account', session: setupSession });
	await expect(load(loadEvent(cookies, 'synthetic-token'))).rejects.toMatchObject({
		status: 303,
		location: '/auth/setup-account'
	});
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));
	vi.clearAllMocks();
	vi.stubEnv('ACCOUNT_SETUP_SESSION_SECRET', 'test-account-setup-session-secret');
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

describe('/auth/setup-account transport', () => {
	it('exchanges a raw token for a signed HTTP-only cookie and tokenless redirect', async () => {
		const cookies = makeCookies();
		await establishSession(cookies);

		expect(resolveLoad).toHaveBeenCalledWith(
			expect.objectContaining({ rawToken: 'synthetic-token', setupSession: null })
		);
		expect(cookies.set).toHaveBeenCalledWith(
			'ttt_account_setup_session',
			expect.any(String),
			expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/auth/setup-account', maxAge: 600 })
		);
		expect(cookies.values.get('ttt_account_setup_session')).not.toContain('synthetic-token');
	});

	it('loads a tokenless page using the signed setup session', async () => {
		const cookies = makeCookies();
		await establishSession(cookies);
		resolveLoad.mockResolvedValueOnce({ state: 'valid', email: 'soldier@example.mil' });

		expect(await load(loadEvent(cookies))).toEqual({ state: 'valid', email: 'soldier@example.mil' });
		expect(resolveLoad).toHaveBeenLastCalledWith(expect.objectContaining({ rawToken: '', setupSession }));
	});

	it('binds completion to the signed session despite submitted identity fields', async () => {
		const cookies = makeCookies();
		await establishSession(cookies);
		completeSetup.mockResolvedValueOnce({ type: 'redirect', path: '/dashboard', clearSession: true });

		await expect(
			actions.default(
				actionEvent(cookies, {
					email: 'other@example.test',
					accessRequestId: 'other-request',
					setupLinkId: 'other-link',
					token: 'other-raw-token'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/dashboard' });
		expect(completeSetup).toHaveBeenCalledWith({
			setupSession,
			password: 'ValidPassword123!',
			confirmPassword: 'ValidPassword123!',
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		});
		expect(cookies.delete).toHaveBeenCalledWith('ttt_account_setup_session', { path: '/auth/setup-account' });
	});

	it('cannot use a posted raw token without a signed setup session', async () => {
		const cookies = makeCookies();
		completeSetup.mockResolvedValueOnce({ type: 'failure', status: 400, error: 'Setup session expired' });

		expect(await actions.default(actionEvent(cookies, { token: 'raw-token' }))).toMatchObject({
			status: 400,
			data: { error: 'Setup session expired' }
		});
		expect(completeSetup).toHaveBeenCalledWith(expect.objectContaining({ setupSession: null }));
	});

	it('clears rejected sessions and returns the flow recovery state', async () => {
		const cookies = makeCookies();
		await establishSession(cookies);
		resolveLoad.mockResolvedValueOnce({
			state: 'replaced',
			message: 'Open the newest setup email',
			clearSession: true
		});

		expect(await load(loadEvent(cookies))).toEqual({ state: 'replaced', message: 'Open the newest setup email' });
		expect(cookies.delete).toHaveBeenCalledWith('ttt_account_setup_session', { path: '/auth/setup-account' });
	});
});
