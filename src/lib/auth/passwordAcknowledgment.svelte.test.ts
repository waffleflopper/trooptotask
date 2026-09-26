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
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined), replaceState: vi.fn() }));
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
	])('requires focused serialized reconciliation after %s, without premature completion', async (failure) => {
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
					return Response.json({ ok: true, activated: true, accepted: 0, unavailable: 0 });
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
				expect(JSON.parse(init.body)).toEqual({ action: 'complete' });
				return new Promise<Response>((resolve) => {
					finish = resolve;
				});
			})
		);
		const h = await form();
		await fireEvent.submit(h.element);
		const check = await screen.findByRole('button', { name: 'Check password update' });
		await waitFor(() => expect(check).toHaveFocus());
		expect(screen.queryByLabelText(/^Confirm/)).toBeNull();
		expect(document.body.textContent).not.toContain('private transport detail');
		expect(finalizations).toBe(0);
		expect(goto).not.toHaveBeenCalled();
		await fireEvent.submit(check.closest('form')!);
		await fireEvent.submit(check.closest('form')!);
		expect(updates).toBe(2);
		expect(check).toBeDisabled();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		finish(Response.json({ ok: true }));
		if (flow === 'security') {
			const restart = await screen.findByRole('button', { name: 'Change password again' });
			await fireEvent.click(restart);
			expect(await screen.findByLabelText(/^New [Pp]assword/)).toHaveValue('');
			expect(document.getElementById('current-password')).toHaveValue('');
		} else if (flow === 'invite') {
			const activate = await screen.findByRole('button', { name: 'Finish activation' });
			await fireEvent.click(activate);
			await screen.findByRole('heading', { name: 'Account activated' });
		} else await screen.findByRole('heading', { name: 'Password updated' });
		expect(finalizations).toBe(flow === 'invite' ? 1 : 0);
		await vi.advanceTimersByTimeAsync(3000);
		if (flow !== 'security') expect(goto).toHaveBeenCalledWith('/dashboard');
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
