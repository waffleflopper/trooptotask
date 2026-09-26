import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveLoad, completeSetup, recoverSetup } = vi.hoisted(() => ({
	resolveLoad: vi.fn(),
	completeSetup: vi.fn(),
	recoverSetup: vi.fn()
}));

vi.mock('$features/identity/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/identity/index.server')>()),
	createSupabaseAccountSetupRouteFlow: vi.fn(() => ({ resolveLoad, completeSetup, recoverSetup }))
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
	} as unknown as Parameters<(typeof actions)['complete']>[0];
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

	it('keeps a status check available after a lost password-response and reload', async () => {
		const cookies = makeCookies();
		await establishSession(cookies);
		completeSetup.mockResolvedValueOnce({
			type: 'progress',
			state: 'recovery-available',
			message: 'Check setup status to continue safely.'
		});
		expect(await actions.complete(actionEvent(cookies))).toMatchObject({
			recoveryState: 'recovery-available'
		});
		expect(cookies.delete).not.toHaveBeenCalledWith('ttt_account_setup_session', { path: '/auth/setup-account' });
		expect(cookies.set).toHaveBeenCalledWith(
			'ttt_account_setup_recovery_state',
			'link-1:pending',
			expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/auth/setup-account' })
		);

		resolveLoad.mockResolvedValueOnce({ state: 'valid', email: 'soldier@example.mil' });
		expect(await load(loadEvent(cookies))).toEqual({ state: 'recovery-available', email: 'soldier@example.mil' });
	});

	it('requires a signed setup session for status checking and never reads a posted password', async () => {
		const cookies = makeCookies();
		const formData = vi.fn(() => Promise.reject(new Error('Recovery must not read the password form')));
		const event = {
			...actionEvent(cookies),
			request: { formData, headers: new Headers({ 'user-agent': 'vitest-agent' }) }
		} as unknown as Parameters<(typeof actions)['recover']>[0];
		expect(await actions.recover(event)).toMatchObject({ status: 400 });
		expect(recoverSetup).not.toHaveBeenCalled();
		await establishSession(cookies);
		recoverSetup.mockResolvedValueOnce({
			type: 'progress',
			state: 'recovered',
			message: 'Account setup is complete.'
		});
		expect(await actions.recover(event)).toMatchObject({ recoveryState: 'recovered' });
		expect(recoverSetup).toHaveBeenCalledWith({
			setupSession,
			clientIp: '203.0.113.10',
			userAgent: 'vitest-agent'
		});
		expect(formData).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalledWith('ttt_account_setup_session', { path: '/auth/setup-account' });
		resolveLoad.mockResolvedValueOnce({
			state: 'used',
			message: 'This setup link has already been used.',
			clearSession: true
		});
		expect(await load(loadEvent(cookies))).toMatchObject({ state: 'recovered' });

		resolveLoad.mockResolvedValueOnce({
			state: 'redirect-setup',
			path: '/auth/setup-account',
			session: { ...setupSession, setupLinkId: 'link-2' }
		});
		await expect(load(loadEvent(cookies, 'other-token'))).rejects.toMatchObject({ status: 303 });
		expect(cookies.delete).toHaveBeenCalledWith('ttt_account_setup_recovery_state', { path: '/auth/setup-account' });
		resolveLoad.mockResolvedValueOnce({ state: 'valid', email: 'other@example.test' });
		expect(await load(loadEvent(cookies))).toMatchObject({ state: 'valid', email: 'other@example.test' });
	});

	it('does not show recovered success from a receipt without its matching signed setup session', async () => {
		const cookies = makeCookies();
		cookies.values.set('ttt_account_setup_recovery_state', 'other-link:recovered');
		resolveLoad.mockResolvedValueOnce({ state: 'missing', message: 'This setup session has expired.' });
		expect(await load(loadEvent(cookies))).toEqual({ state: 'missing', message: 'This setup session has expired.' });
		expect(cookies.delete).toHaveBeenCalledWith('ttt_account_setup_recovery_state', { path: '/auth/setup-account' });
	});

	it('binds completion to the signed session despite submitted identity fields', async () => {
		const cookies = makeCookies();
		await establishSession(cookies);
		completeSetup.mockResolvedValueOnce({ type: 'redirect', path: '/dashboard', clearSession: true });

		await expect(
			actions.complete(
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

		expect(await actions.complete(actionEvent(cookies, { token: 'raw-token' }))).toMatchObject({
			status: 400,
			data: { error: 'Setup session expired' }
		});
		expect(completeSetup).toHaveBeenCalledWith(expect.objectContaining({ setupSession: null }));
	});

	it('carries the staff recovery state through the action after clearing the claimed session', async () => {
		const cookies = makeCookies();
		await establishSession(cookies);
		completeSetup.mockResolvedValueOnce({
			type: 'failure',
			status: 500,
			error: 'Contact platform support. Give support request ID request-1.',
			clearSession: true,
			supportRequired: true
		});

		expect(await actions.complete(actionEvent(cookies))).toMatchObject({
			status: 500,
			data: { error: expect.stringContaining('request ID request-1'), supportRequired: true }
		});
		expect(cookies.delete).toHaveBeenCalledWith('ttt_account_setup_session', { path: '/auth/setup-account' });
		expect(cookies.set).toHaveBeenCalledWith(
			'ttt_account_setup_support',
			'1',
			expect.objectContaining({ path: '/auth/setup-account', httpOnly: true, sameSite: 'lax' })
		);

		resolveLoad.mockResolvedValueOnce({ state: 'missing', message: 'This setup session has expired.' });
		expect(await load(loadEvent(cookies))).toEqual({
			state: 'support-required',
			message: 'Contact platform support to resolve the previous setup attempt before trying another link.'
		});

		resolveLoad.mockResolvedValueOnce({ state: 'redirect-setup', path: '/auth/setup-account', session: setupSession });
		await expect(load(loadEvent(cookies, 'new-synthetic-token'))).rejects.toMatchObject({ status: 303 });
		expect(cookies.delete).toHaveBeenCalledWith('ttt_account_setup_support', { path: '/auth/setup-account' });
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
