// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import Security from '../../routes/account/security/+page.svelte';
import Recovery from '../../routes/auth/reset-password/+page.svelte';
import Invite from '../../routes/auth/accept-invite/+page.svelte';
import type { PageData } from '../../routes/account/security/$types';
vi.mock('$app/forms', () => ({ enhance: () => {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/stores', () => ({ page: writable({ data: { hasSession: true }, state: {} }) }));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.useRealTimers();
});
describe.each(['security', 'recovery', 'invite'] as const)('%s mutation acknowledgment', (flow) => {
	async function form() {
		if (flow === 'security')
			render(Security, {
				props: {
					data: { hasMFA: false, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
					form: null
				}
			});
		else if (flow === 'recovery') render(Recovery);
		else render(Invite);
		const password = await screen.findByLabelText(flow === 'invite' ? /^Password/ : /^New [Pp]assword/);
		const confirm = screen.getByLabelText(/^Confirm/);
		await fireEvent.input(password, { target: { value: 'NewPassword12' } });
		await fireEvent.input(confirm, { target: { value: 'NewPassword12' } });
		const first = flow === 'security' ? document.getElementById('current-password')! : password;
		if (flow === 'security') await fireEvent.input(first, { target: { value: 'OldPassword12' } });
		return { password, confirm, first, element: password.closest('form')! };
	}
	it.each([
		'provider rejection',
		'network exception',
		'invalid JSON',
		'missing acknowledgment',
		'contradictory success',
		'null response'
	])('retains drafts and focused serialized retry after %s, without premature completion', async (failure) => {
		let updates = 0,
			finalizations = 0;
		let finish!: (r: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url, init) => {
				if (init?.body && JSON.parse(init.body).action === 'restart') return Response.json({ ok: true });
				if (url === '/api/auth/mfa/status') return Response.json({ currentLevel: 'aal1', nextLevel: 'aal1' });
				if (url === '/api/auth/finalize-invite') {
					finalizations++;
					return Response.json({ ok: true });
				}
				if (url !== '/api/auth/update-password') throw Error(`Unexpected ${url}`);
				updates++;
				if (updates === 1) {
					if (failure === 'network exception') throw Error('private transport detail');
					if (failure === 'invalid JSON') return new Response('<html>Unavailable</html>', { status: 503 });
					if (failure === 'missing acknowledgment') return Response.json({});
					if (failure === 'null response') return Response.json(null);
					if (failure === 'contradictory success') return Response.json({ ok: true, error: 'Mutation unavailable' });
					return Response.json({ error: 'Mutation unavailable' }, { status: 503 });
				}
				return new Promise<Response>((resolve) => {
					finish = resolve;
				});
			})
		);
		const h = await form();
		await fireEvent.submit(h.element);
		await waitFor(() => expect(h.first).toHaveFocus());
		expect(h.password).toHaveValue('NewPassword12');
		expect(h.confirm).toHaveValue('NewPassword12');
		if (flow === 'security') expect(h.first).toHaveValue('OldPassword12');
		expect(document.body.textContent).not.toContain('private transport detail');
		expect(finalizations).toBe(0);
		expect(goto).not.toHaveBeenCalled();
		await fireEvent.submit(h.element);
		await fireEvent.submit(h.element);
		expect(updates).toBe(2);
		expect(h.element.querySelector('button[type=submit]')).toBeDisabled();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		finish(Response.json({ ok: true }));
		if (flow === 'security') {
			const restart = await screen.findByRole('button', { name: 'Change password again' });
			await fireEvent.click(restart);
			expect(await screen.findByLabelText(/^New [Pp]assword/)).toHaveValue('');
			expect(document.getElementById('current-password')).toHaveValue('');
		} else await screen.findByRole('heading', { name: flow === 'recovery' ? 'Password updated' : 'Account activated' });
		expect(finalizations).toBe(flow === 'invite' ? 1 : 0);
		await vi.advanceTimersByTimeAsync(3000);
		if (flow !== 'security') expect(goto).toHaveBeenCalledWith(flow === 'recovery' ? '/auth/login' : '/dashboard');
	});
	it('follows expiry redirects without clearing drafts or treating redirected HTML as success', async () => {
		const response = new Response('<html>Login</html>');
		Object.defineProperties(response, {
			redirected: { value: true },
			url: { value: 'https://app.invalid/auth/login' }
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) =>
				url === '/api/auth/mfa/status' ? Response.json({ currentLevel: 'aal1', nextLevel: 'aal1' }) : response
			)
		);
		const h = await form();
		await fireEvent.submit(h.element);
		await waitFor(() => expect(goto).toHaveBeenCalledWith('https://app.invalid/auth/login'));
		expect(h.password).toHaveValue('NewPassword12');
	});
});
