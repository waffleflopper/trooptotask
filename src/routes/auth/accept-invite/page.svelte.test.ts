// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import Page from './+page.svelte';
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/stores', () => ({ page: writable({ data: { hasSession: true }, state: {} }) }));
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
				: Response.json({ ok: true, activated: true, accepted: 1 });
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
