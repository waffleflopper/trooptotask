// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
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
});
it.each(['security', 'recovery', 'invite'] as const)(
	'%s retains passwords across mutation-time MFA denial, code failure and retry',
	async (flow) => {
		const updates: unknown[] = [];
		let verified = false;
		let codeAttempts = 0;
		let finalized = false;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url, init) => {
				if (url === '/api/auth/mfa/status') return Response.json({ currentLevel: 'aal1', nextLevel: 'aal1' });
				if (url === '/api/auth/mfa/verify') {
					codeAttempts++;
					if (codeAttempts === 1) return Response.json({ error: 'Code expired' }, { status: 401 });
					verified = true;
					return Response.json({ ok: true });
				}
				if (url === '/api/auth/update-password') {
					const body = JSON.parse(init.body);
					updates.push(body);
					if (!verified) return Response.json({ code: 'mfa_required', error: 'Verify MFA' }, { status: 403 });
					// An unknown mutation result must enter durable reconciliation.
					return Response.json({ error: 'Synthetic mutation unavailable' }, { status: 503 });
				}
				if (url === '/api/auth/finalize-invite') {
					finalized = true;
					return Response.json({ ok: true });
				}
				throw new Error(`Unexpected request ${url}`);
			})
		);
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
		if (flow === 'security')
			await fireEvent.input(document.getElementById('current-password')!, { target: { value: 'OldPassword12' } });
		await fireEvent.submit(password.closest('form')!);
		const code = await screen.findByLabelText('Authenticator Code');
		await waitFor(() => expect(code).toHaveFocus());
		expect(finalized).toBe(false);
		expect(updates).toHaveLength(1);
		await fireEvent.input(code, { target: { value: '123456' } });
		await fireEvent.submit(code.closest('form')!);
		expect(await screen.findByText('Code expired')).toBeVisible();
		expect(code).toHaveValue('123456');
		await waitFor(() => expect(code).toHaveFocus());
		expect(updates).toHaveLength(1);
		await fireEvent.submit(code.closest('form')!);
		const retained = await screen.findByLabelText(flow === 'invite' ? /^Password/ : /^New [Pp]assword/);
		expect(retained).toHaveValue('NewPassword12');
		expect(screen.getByLabelText(/^Confirm/)).toHaveValue('NewPassword12');
		if (flow === 'security') expect(document.getElementById('current-password')).toHaveValue('OldPassword12');
		await waitFor(() =>
			expect(flow === 'security' ? document.getElementById('current-password') : retained).toHaveFocus()
		);
		await fireEvent.submit(retained.closest('form')!);
		expect(await screen.findByRole('button', { name: 'Check password update' })).toHaveFocus();
		expect(updates).toEqual(
			flow === 'security'
				? [
						{ currentPassword: 'OldPassword12', password: 'NewPassword12', confirmPassword: 'NewPassword12' },
						{ currentPassword: 'OldPassword12', password: 'NewPassword12', confirmPassword: 'NewPassword12' }
					]
				: [{ password: 'NewPassword12' }, { password: 'NewPassword12' }]
		);
		expect(finalized).toBe(false);
	}
);
