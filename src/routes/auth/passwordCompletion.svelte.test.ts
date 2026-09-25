// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { page } from '$app/stores';
import Security from '../account/security/+page.svelte';
import Recovery from './reset-password/+page.svelte';
import Invite from './accept-invite/+page.svelte';
import type { PageData } from '../account/security/$types';
vi.mock('$app/forms', () => ({ enhance: () => {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/stores', () => ({ page: writable({ data: { hasSession: true }, state: {} }) }));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.useRealTimers();
});
describe.each(['security', 'recovery', 'invite'] as const)('%s confirmed completion', (flow) => {
	function mount(state: 'started' | 'pending' | 'complete' | 'failed' | 'expired' | null = null) {
		const data = { hasSession: true, passwordCompletion: state };
		(page as unknown as { set: (x: unknown) => void }).set({ data, state: {} });
		if (flow === 'security')
			return render(Security, {
				props: {
					data: {
						...data,
						hasMFA: true,
						currentEmail: 'synthetic@example.test',
						pendingEmail: null,
						session: null,
						accountPathname: '/account/security'
					} as PageData,
					form: null
				}
			});
		return flow === 'recovery' ? render(Recovery) : render(Invite);
	}
	it('resumes after reload, handles MFA and a transport failure, and never resubmits the password', async () => {
		const requests: unknown[] = [];
		let mutations = 0,
			completions = 0,
			verifications = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url, init) => {
				if (url === '/api/auth/mfa/status') return Response.json({ currentLevel: 'aal2', nextLevel: 'aal2' });
				if (url === '/api/auth/mfa/verify') {
					verifications++;
					return verifications === 1
						? Response.json({ error: 'Code rejected' }, { status: 401 })
						: Response.json({ ok: true });
				}
				if (url !== '/api/auth/update-password') throw Error(`Unexpected ${url}`);
				const body = JSON.parse(init.body);
				requests.push(body);
				if (body.password) {
					mutations++;
					return Response.json(
						{ ok: false, passwordUpdated: true, code: 'session_revocation_pending' },
						{ status: 202 }
					);
				}
				expect(body).toEqual({ action: 'complete' });
				completions++;
				if (completions === 1) return Response.json({ code: 'mfa_required' }, { status: 403 });
				if (completions === 2) throw Error('private transport');
				return Response.json({ ok: true });
			})
		);
		const mounted = mount();
		const password = await screen.findByLabelText(flow === 'invite' ? /^Password/ : /^New [Pp]assword/);
		await fireEvent.input(password, { target: { value: 'NewPassword12' } });
		await fireEvent.input(screen.getByLabelText(/^Confirm/), { target: { value: 'NewPassword12' } });
		if (flow === 'security')
			await fireEvent.input(document.getElementById('current-password')!, { target: { value: 'OldPassword12' } });
		await fireEvent.submit(password.closest('form')!);
		expect(await screen.findByRole('button', { name: 'Finish password update' })).toBeEnabled();
		expect(screen.queryByLabelText(/^Confirm/)).toBeNull();
		mounted.unmount();
		mount('pending');
		const resume = await screen.findByRole('button', { name: 'Finish password update' });
		await waitFor(() => expect(resume).toHaveFocus());
		await fireEvent.submit(resume.closest('form')!);
		const code = await screen.findByLabelText('Authenticator Code');
		await fireEvent.input(code, { target: { value: '123456' } });
		await fireEvent.submit(code.closest('form')!);
		expect(await screen.findByText('Code rejected')).toBeVisible();
		await fireEvent.submit(code.closest('form')!);
		const retry = await screen.findByRole('button', { name: 'Finish password update' });
		await waitFor(() => expect(retry).toHaveFocus());
		await fireEvent.submit(retry.closest('form')!);
		expect(await screen.findByRole('alert')).toBeVisible();
		expect(document.body.textContent).not.toContain('private transport');
		await waitFor(() => expect(retry).toHaveFocus());
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		await fireEvent.submit(retry.closest('form')!);
		if (flow === 'security') expect(await screen.findByRole('button', { name: 'Change password again' })).toBeEnabled();
		if (flow === 'recovery') expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible();
		if (flow === 'invite') expect(await screen.findByRole('button', { name: 'Finish activation' })).toHaveFocus();
		expect(mutations).toBe(1);
		expect(requests.slice(1)).toEqual([{ action: 'complete' }, { action: 'complete' }, { action: 'complete' }]);
	});
	it('serializes completion retries and does not accept an unacknowledged response', async () => {
		let finish!: (response: Response) => void;
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		mount('pending');
		const button = await screen.findByRole('button', { name: 'Finish password update' });
		const form = button.closest('form')!;
		await fireEvent.submit(form);
		await fireEvent.submit(form);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(button).toBeDisabled();
		finish(Response.json({}));
		expect(await screen.findByRole('alert')).toBeVisible();
		expect(button).toBeEnabled();
		expect(screen.queryByLabelText(/^Confirm/)).toBeNull();
	});
	it('does not reopen password entry for an expired attempt', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		mount('expired');
		expect(await screen.findByRole('button', { name: 'Sign out' })).toBeEnabled();
		expect(screen.queryByLabelText(/^Confirm/)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('reconciles a lost initial response after reload and requires an explicit restart after fencing', async () => {
		const requests: Record<string, unknown>[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url, init) => {
				if (url === '/api/auth/mfa/status') return Response.json({ currentLevel: 'aal2', nextLevel: 'aal2' });
				const body = JSON.parse(init.body);
				requests.push(body);
				if (body.password) throw Error('lost transport');
				if (body.action === 'complete')
					return Response.json(
						{ ok: false, code: 'password_reconciliation_required', state: 'failed', error: 'Attempt fenced' },
						{ status: 409 }
					);
				return Response.json({ ok: true });
			})
		);
		const mounted = mount();
		const password = await screen.findByLabelText(flow === 'invite' ? /^Password/ : /^New [Pp]assword/);
		await fireEvent.input(password, { target: { value: 'NewPassword12' } });
		await fireEvent.input(screen.getByLabelText(/^Confirm/), { target: { value: 'NewPassword12' } });
		if (flow === 'security')
			await fireEvent.input(document.getElementById('current-password')!, { target: { value: 'OldPassword12' } });
		await fireEvent.submit(password.closest('form')!);
		expect(await screen.findByRole('button', { name: 'Check password update' })).toHaveFocus();
		expect(screen.queryByLabelText(/^Confirm/)).toBeNull();
		mounted.unmount();
		mount('started');
		const check = await screen.findByRole('button', { name: 'Check password update' });
		await fireEvent.submit(check.closest('form')!);
		const restart = await screen.findByRole('button', { name: 'Start new password update' });
		await waitFor(() => expect(restart).toHaveFocus());
		expect(screen.queryByLabelText(/^Confirm/)).toBeNull();
		await fireEvent.submit(restart.closest('form')!);
		expect(await screen.findByLabelText(flow === 'invite' ? /^Password/ : /^New [Pp]assword/)).toHaveValue('');
		expect(requests.slice(1)).toEqual([{ action: 'complete' }, { action: 'restart' }]);
	});
});
