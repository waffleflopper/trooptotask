// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable, type Writable } from 'svelte/store';
import { page } from '$app/stores';
import { goto, replaceState } from '$app/navigation';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined), replaceState: vi.fn() }));
vi.mock('$app/stores', () => ({ page: writable({ data: { hasSession: true }, state: {} }) }));
const recoveryPage = page as unknown as Writable<{ data: { hasSession: boolean }; state: object }>;
afterEach(() => {
	recoveryPage.set({ data: { hasSession: true }, state: {} });
	window.history.replaceState({}, '', '/auth/reset-password');
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it.each(['status', 'verification'])(
	'returns to login when the recovery session expires during MFA %s',
	async (stage) => {
		const response = new Response('<html>Sign in</html>');
		Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://localhost/auth/login' } });
		const fetchMock = vi.fn().mockResolvedValue(response);
		if (stage === 'verification')
			fetchMock.mockResolvedValueOnce(Response.json({ currentLevel: 'aal1', nextLevel: 'aal2' }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page);
		if (stage === 'verification') {
			await fireEvent.input(await screen.findByLabelText('Authenticator Code'), { target: { value: '123456' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }));
		}
		await waitFor(() => expect(goto).toHaveBeenCalledWith('http://localhost/auth/login'));
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
	}
);

it.each(['invalid code', 'provider unavailable', 'network failure', 'invalid success response'])(
	'retains verification after %s and advances only after a serialized successful retry',
	async (failure) => {
		let finish!: (response: Response) => void;
		const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ currentLevel: 'aal1', nextLevel: 'aal2' }));
		if (failure === 'network failure') fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
		else if (failure === 'invalid success response') fetchMock.mockResolvedValueOnce(Response.json({}));
		else
			fetchMock.mockResolvedValueOnce(
				Response.json({ error: failure }, { status: failure === 'invalid code' ? 401 : 503 })
			);
		fetchMock.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		render(Page);
		const code = await screen.findByLabelText('Authenticator Code');
		await fireEvent.input(code, { target: { value: '123456' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }));
		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
		expect(code).toHaveValue('123456');
		await fireEvent.input(code, { target: { value: '654321' } });
		await fireEvent.submit(code.closest('form')!);
		expect(code).toBeDisabled();
		expect(screen.getByRole('button', { name: /Verifying/ })).toBeDisabled();
		await fireEvent.submit(code.closest('form')!);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(JSON.parse(fetchMock.mock.calls[3 - 1][1].body)).toEqual({ code: '654321' });
		finish(Response.json({ ok: true }));
		expect(await screen.findByLabelText(/^New Password/)).toBeEnabled();
		expect(screen.queryByLabelText('Authenticator Code')).toBeNull();
	}
);

it.each([
	['password-only session', 'aal1', 'aal1', false],
	['MFA required', 'aal1', 'aal2', true],
	['MFA completed', 'aal2', 'aal2', false],
	['already elevated session', 'aal2', 'aal1', false]
])('uses confirmed status for %s', async (_, currentLevel, nextLevel, needsMfa) => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ currentLevel, nextLevel })));
	render(Page);
	if (needsMfa) {
		expect(await screen.findByLabelText('Authenticator Code')).toBeEnabled();
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
	} else {
		expect(await screen.findByLabelText(/^New Password/)).toBeEnabled();
		expect(screen.queryByLabelText('Authenticator Code')).toBeNull();
	}
});

it.each([
	'network error',
	'provider error',
	'non-JSON',
	'missing levels',
	'null body',
	'unknown current level',
	'unknown next level'
])(
	'keeps password entry blocked after status %s and retries without replacing the recovery session',
	async (failure) => {
		let finish!: (response: Response) => void;
		const fetchMock = vi.fn();
		if (failure === 'network error') fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		else if (failure === 'provider error')
			fetchMock.mockResolvedValueOnce(
				Response.json({ currentLevel: 'aal2', nextLevel: 'aal2', error: 'unavailable' }, { status: 503 })
			);
		else if (failure === 'non-JSON') fetchMock.mockResolvedValueOnce(new Response('<html>Unavailable</html>'));
		else
			fetchMock.mockResolvedValueOnce(
				Response.json(
					failure === 'null body'
						? null
						: failure === 'missing levels'
							? {}
							: {
									currentLevel: failure === 'unknown current level' ? 'aal3' : 'aal1',
									nextLevel: failure === 'unknown next level' ? 'aal3' : 'aal2'
								}
				)
			);
		fetchMock.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		render(Page);
		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
		expect(screen.queryByLabelText('Authenticator Code')).toBeNull();
		const retry = screen.getByRole('button', { name: 'Retry security check' });
		retry.focus();
		expect(retry).toHaveFocus();
		await fireEvent.click(retry);
		expect(retry).toBeDisabled();
		await fireEvent.click(retry);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls.every(([url]) => url === '/api/auth/mfa/status')).toBe(true);
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
		finish(Response.json({ currentLevel: 'aal1', nextLevel: 'aal2' }));
		expect(await screen.findByLabelText('Authenticator Code')).toBeEnabled();
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
	}
);

it('clears an exchanged recovery hash and retries unavailable status without exchanging the credentials again', async () => {
	recoveryPage.set({ data: { hasSession: false }, state: {} });
	window.history.replaceState(
		{},
		'',
		'/auth/reset-password#access_token=synthetic-access&refresh_token=synthetic-refresh'
	);
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ ok: true }))
		.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		.mockResolvedValueOnce(Response.json({ currentLevel: 'aal1', nextLevel: 'aal1' }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page);
	expect(await screen.findByRole('alert')).toBeTruthy();
	expect(replaceState).toHaveBeenCalledWith('/auth/reset-password', {});
	expect(screen.queryByLabelText(/^New Password/)).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Retry security check' }));
	expect(await screen.findByLabelText(/^New Password/)).toBeEnabled();
	expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
		'/api/auth/establish-session',
		'/api/auth/mfa/status',
		'/api/auth/mfa/status'
	]);
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
		accessToken: 'synthetic-access',
		refreshToken: 'synthetic-refresh',
		flow: 'recovery'
	});
});

it('keeps a missing recovery session unavailable without offering a status retry', async () => {
	recoveryPage.set({ data: { hasSession: false }, state: {} });
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Page);
	expect(await screen.findByRole('alert')).toBeTruthy();
	expect(screen.queryByRole('button', { name: 'Retry security check' })).toBeNull();
	expect(screen.queryByLabelText(/^New Password/)).toBeNull();
	expect(fetchMock).not.toHaveBeenCalled();
});
