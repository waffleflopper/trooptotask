// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import Page from './+page.svelte';
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined), replaceState: vi.fn() }));
vi.mock('$app/stores', () => ({ page: writable({ data: { hasSession: true }, state: {} }) }));
beforeEach(async () => {
	const { page } = await import('$app/stores');
	(page as unknown as ReturnType<typeof writable>).set({ data: { hasSession: true, invitePending: true }, state: {} });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.useRealTimers();
});
async function setPassword() {
	render(Page);
	const password = await screen.findByLabelText(/^Password/);
	await fireEvent.input(password, { target: { value: 'NewPassword12' } });
	await fireEvent.input(screen.getByLabelText(/^Confirm Password/), { target: { value: 'NewPassword12' } });
	await fireEvent.submit(password.closest('form')!);
}
it('retains completed password state through denied finalization, MFA error and activation-only retry', async () => {
	let mutations = 0,
		finalizations = 0,
		verifications = 0;
	const fetchMock = vi.fn(async (url) => {
		if (url === '/api/auth/update-password') {
			mutations++;
			return Response.json({ ok: true });
		}
		if (url === '/api/auth/finalize-invite') {
			finalizations++;
			return finalizations === 1
				? Response.json({ code: 'mfa_required', error: 'Verify MFA' }, { status: 403 })
				: Response.json({ ok: true, activated: true, accepted: 1, unavailable: 0 });
		}
		if (url === '/api/auth/mfa/verify') {
			verifications++;
			return verifications === 1
				? Response.json({ error: 'Invalid code' }, { status: 401 })
				: Response.json({ ok: true });
		}
		throw new Error(`Unexpected ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	await setPassword();
	const code = await screen.findByLabelText('Authenticator Code');
	await waitFor(() => expect(code).toHaveFocus());
	expect(screen.queryByLabelText(/^Password/)).toBeNull();
	expect(mutations).toBe(1);
	await fireEvent.input(code, { target: { value: '123456' } });
	await fireEvent.submit(code.closest('form')!);
	expect(await screen.findByText('Invalid code')).toBeVisible();
	expect(code).toHaveValue('123456');
	await fireEvent.submit(code.closest('form')!);
	const finish = await screen.findByRole('button', { name: 'Finish activation' });
	await waitFor(() => expect(finish).toHaveFocus());
	expect(finalizations).toBe(1);
	expect(mutations).toBe(1);
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	await fireEvent.click(finish);
	expect(await screen.findByRole('heading', { name: 'Account activated' })).toBeVisible();
	expect(mutations).toBe(1);
	expect(finalizations).toBe(2);
	await vi.advanceTimersByTimeAsync(2000);
	expect(goto).toHaveBeenCalledWith('/dashboard');
});
it.each(['provider denial', 'network failure', 'invalid JSON', 'unacknowledged success'])(
	'retries only activation after %s and serializes pending requests',
	async (kind) => {
		let finalizations = 0,
			mutations = 0,
			finish!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) => {
				if (url === '/api/auth/update-password') {
					mutations++;
					return Response.json({ ok: true });
				}
				if (url === '/api/auth/finalize-invite') {
					finalizations++;
					if (finalizations === 1) {
						if (kind === 'network failure') throw new Error('Lost connection');
						if (kind === 'invalid JSON') return new Response('<html>Unavailable</html>', { status: 503 });
						if (kind === 'unacknowledged success') return Response.json({});
						return Response.json({ error: 'Security status unavailable' }, { status: 503 });
					}
					return new Promise<Response>((resolve) => {
						finish = resolve;
					});
				}
				throw new Error(`Unexpected ${url}`);
			})
		);
		await setPassword();
		expect(await screen.findByRole('alert')).toBeVisible();
		const retry = screen.getByRole('button', { name: 'Finish activation' });
		await waitFor(() => expect(retry).toHaveFocus());
		await fireEvent.click(retry);
		expect(retry).toBeDisabled();
		await fireEvent.click(retry);
		expect(mutations).toBe(1);
		expect(finalizations).toBe(2);
		finish(Response.json({ error: 'Still unavailable' }, { status: 503 }));
		expect(await screen.findByText('Still unavailable')).toBeVisible();
		expect(await screen.findByRole('button', { name: 'Finish activation' })).toBeEnabled();
		expect(screen.queryByLabelText(/^Password/)).toBeNull();
	}
);
it('follows finalization expiry redirects without accepting the redirected HTML as completion', async () => {
	const redirect = new Response('<html>Login</html>');
	Object.defineProperties(redirect, { redirected: { value: true }, url: { value: 'https://app.invalid/auth/login' } });
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(Response.json({ ok: true }))
			.mockResolvedValueOnce(redirect)
	);
	await setPassword();
	await waitFor(() => expect(goto).toHaveBeenCalledWith('https://app.invalid/auth/login'));
	expect(screen.queryByRole('heading', { name: 'Account activated' })).toBeNull();
});
it.each([
	{ ok: true },
	{ ok: true, activated: false, unavailable: 0 },
	{ ok: true, activated: true, unavailable: -1 },
	{ ok: true, activated: true }
])('requires explicit, valid activation acknowledgment: %j', async (payload) => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(Response.json({ ok: true }))
			.mockResolvedValueOnce(Response.json(payload))
	);
	await setPassword();
	expect(await screen.findByRole('alert')).toBeVisible();
	expect(screen.queryByRole('heading', { name: 'Account activated' })).toBeNull();
	expect(await screen.findByRole('button', { name: 'Finish activation' })).toBeEnabled();
});
it('shows unavailable invitations separately from account activation with an explicit continuation', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(Response.json({ ok: true }))
			.mockResolvedValueOnce(Response.json({ ok: true, activated: true, accepted: 1, unavailable: 1 }))
	);
	await setPassword();
	expect(await screen.findByText(/They did not grant membership/)).toBeVisible();
	expect(screen.getByRole('link', { name: 'Continue to dashboard' })).toHaveAttribute('href', '/dashboard');
	expect(goto).not.toHaveBeenCalled();
});
it('revisits a cleared invite without offering another password write or activation request', async () => {
	const { page } = await import('$app/stores');
	(page as unknown as ReturnType<typeof writable>).set({
		data: { hasSession: true, invitePending: false, passwordCompletion: null },
		state: {}
	});
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Page);
	expect(await screen.findByRole('link', { name: 'Continue to dashboard' })).toHaveAttribute('href', '/dashboard');
	expect(screen.queryByRole('button', { name: 'Finish activation' })).toBeNull();
	expect(screen.queryByLabelText(/^Password/)).toBeNull();
	expect(fetchMock).not.toHaveBeenCalled();
});
it('offers reviewed Account Setup Link recovery without repeating the completed password', async () => {
	const { page } = await import('$app/stores');
	(page as unknown as ReturnType<typeof writable>).set({
		data: { hasSession: true, invitePending: true, passwordCompletion: 'complete' },
		state: {}
	});
	const fetchMock = vi
		.fn()
		.mockResolvedValue(Response.json({ code: 'setup_required', error: 'Complete account setup.' }, { status: 409 }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page);
	await fireEvent.click(await screen.findByRole('button', { name: 'Finish activation' }));
	expect(await screen.findByRole('link', { name: 'Request an Account Setup Link' })).toHaveAttribute(
		'href',
		'/auth/renew-invite'
	);
	expect(screen.queryByLabelText(/^Password/)).toBeNull();
	expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('reconciles a lost activation response when retry confirms the pending marker is already cleared', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ ok: true }))
		.mockRejectedValueOnce(new Error('Response lost after cookies arrived'))
		.mockResolvedValueOnce(Response.json({ code: 'invite_not_pending', activated: false }, { status: 403 }));
	vi.stubGlobal('fetch', fetchMock);
	await setPassword();
	await fireEvent.click(await screen.findByRole('button', { name: 'Finish activation' }));
	expect(await screen.findByRole('link', { name: 'Continue to dashboard' })).toHaveAttribute('href', '/dashboard');
	expect(screen.queryByRole('button', { name: 'Finish activation' })).toBeNull();
	expect(screen.queryByRole('heading', { name: 'Account activated' })).toBeNull();
	expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/update-password')).toHaveLength(1);
});
